import { BlobReader, ZipWriter } from '@zip.js/zip.js'
import { createWriteStream, openAsBlob, type Stats } from 'node:fs'
import { lstat, opendir } from 'node:fs/promises'
import path from 'node:path'
import { Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { DEFAULT_HIGH_WATER_MARK } from '../constants/files'
import { storageQuotaExceededError } from './errors'
import { createProgressTransform, fileName, isPathInside } from './files'

export interface ZipFileEntry {
  name: string
  path: string
  rootAlias?: string | null
}

interface ZipRoot {
  archivePath: string
  realPath: string
  stats: Stats
}

function archiveRoots(entries: { entry: ZipFileEntry; realPath: string; stats: Stats }[]): ZipRoot[] {
  return entries.map(({ entry, realPath, stats }) => {
    const archivePath = stats.isDirectory() && entries.length === 1 ? '' : entry.rootAlias ? entry.name : fileName(realPath)
    return { archivePath, realPath, stats }
  })
}

function archiveEntryPath(realPath: string, root: ZipRoot): string {
  const relativePath = path.relative(root.realPath, realPath)
  return path.posix.join(root.archivePath, relativePath.split(path.sep).join('/'))
}

function abortReason(signal?: AbortSignal): Error {
  return signal?.reason instanceof Error ? signal.reason : new Error('Cancelled')
}

async function addPath(archive: ZipWriter<unknown>, root: ZipRoot, realPath: string, stats: Stats, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted()
  const archivePath = archiveEntryPath(realPath, root)
  const entryOptions = {
    lastModDate: stats.mtime,
    signal,
    unixMode: stats.mode
  }

  if (stats.isDirectory()) {
    await archive.add(archivePath, undefined, { ...entryOptions, directory: true })
    const directory = await opendir(realPath)
    for await (const entry of directory) {
      signal?.throwIfAborted()
      const entryPath = path.join(realPath, entry.name)
      await addPath(archive, root, entryPath, await lstat(entryPath), signal)
    }
    return
  }

  if (stats.isSymbolicLink()) {
    throw new Error(`ZIP symbolic links are not supported: ${realPath}`)
  }

  if (!stats.isFile()) {
    throw new Error(`Unsupported ZIP entry type: ${realPath}`)
  }

  await archive.add(archivePath, new BlobReader(await openAsBlob(realPath)), entryOptions)
}

export async function createZip(
  outputPath: string,
  entries: ZipFileEntry[],
  compress: boolean,
  signal?: AbortSignal,
  onProgress?: (bytes: number) => void,
  maxArchiveSize?: number
): Promise<void> {
  signal?.throwIfAborted()
  if (entries.length === 0) {
    throw new Error('Cannot create a ZIP archive without entries')
  }

  const resolvedPaths = entries.map(({ path: entryPath }) => path.resolve(entryPath))
  const stats = await Promise.all(resolvedPaths.map((entryPath) => lstat(entryPath)))
  signal?.throwIfAborted()
  const selectedDirectoryPaths = resolvedPaths.filter((_entryPath, index) => stats[index].isDirectory())
  const selectedEntries = entries
    .map((entry, index) => ({ entry, realPath: resolvedPaths[index], stats: stats[index] }))
    .filter(({ realPath }) => !selectedDirectoryPaths.some((parentPath) => isPathInside(parentPath, realPath)))
  const roots = archiveRoots(selectedEntries)

  const output = createWriteStream(outputPath, { highWaterMark: DEFAULT_HIGH_WATER_MARK })
  const progressTransform =
    onProgress || maxArchiveSize !== undefined ? createProgressTransform(onProgress, maxArchiveSize, storageQuotaExceededError) : undefined
  const archiveOutput = progressTransform ?? output
  const outputPromise = progressTransform ? pipeline(progressTransform, output) : undefined
  void outputPromise?.catch(() => undefined)
  const archive = new ZipWriter(Writable.toWeb(archiveOutput), { level: compress ? 6 : 0, signal, useWebWorkers: false })

  try {
    for (const root of roots) {
      await addPath(archive, root, root.realPath, root.stats, signal)
    }
    signal?.throwIfAborted()
    await archive.close()
    await outputPromise
    signal?.throwIfAborted()
  } catch (error) {
    const reason = error instanceof Error ? error : new Error(String(error))
    archiveOutput.destroy(reason)
    if (progressTransform) output.destroy(reason)
    await outputPromise?.catch(() => undefined)
    if (signal?.aborted) throw abortReason(signal)
    throw error
  }
}
