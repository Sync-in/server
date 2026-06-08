import { createWriteStream } from 'node:fs'
import { lstat } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { create, type Pack, type WriteEntry } from 'tar'
import { DEFAULT_HIGH_WATER_MARK } from '../constants/files'
import { storageQuotaExceededError } from './errors'
import { createProgressTransform, fileName, isPathInside } from './files'

export interface TarFileEntry {
  name: string
  path: string
  rootAlias?: string | null
}

interface TarRoot {
  archivePath: string
  realPath: string
}

function archiveRoots(entries: TarFileEntry[], directoryPaths: Set<string>): TarRoot[] {
  // Maps each selected filesystem root to the name expected inside the archive.
  return entries
    .map((entry) => {
      const realPath = path.resolve(entry.path)
      const isDirectory = directoryPaths.has(realPath)
      const archivePath = isDirectory && entries.length === 1 ? '' : entry.rootAlias ? entry.name : fileName(realPath)
      return { archivePath, realPath }
    })
    .sort((a, b) => b.realPath.length - a.realPath.length)
}

function archiveEntryPath(realPath: string, roots: TarRoot[]): string {
  // Converts the absolute path emitted by node-tar to its portable archive path.
  const root = roots.find(({ realPath: rootPath }) => realPath === rootPath || realPath.startsWith(`${rootPath}${path.sep}`))
  if (!root) {
    throw new Error(`Unexpected TAR entry path: ${realPath}`)
  }
  const relativePath = path.relative(root.realPath, realPath)
  return path.posix.join(root.archivePath, relativePath.split(path.sep).join('/')) || './'
}

function abortReason(signal?: AbortSignal): Error {
  return signal?.reason instanceof Error ? signal.reason : new Error('Cancelled')
}

export async function createTar(
  outputPath: string,
  entries: TarFileEntry[],
  compress: boolean,
  signal?: AbortSignal,
  onProgress?: (bytes: number) => void,
  maxArchiveSize?: number
): Promise<void> {
  // Creates a TAR/TGZ archive while node-tar handles recursion and file streaming.
  signal?.throwIfAborted()
  if (entries.length === 0) {
    throw new Error('Cannot create a TAR archive without entries')
  }

  const resolvedPaths = entries.map(({ path: entryPath }) => path.resolve(entryPath))
  const stats = await Promise.all(resolvedPaths.map((entryPath) => lstat(entryPath)))
  signal?.throwIfAborted()
  const directoryPaths = new Set(resolvedPaths.filter((_entryPath, index) => stats[index].isDirectory()))
  const selectedDirectoryPaths = [...directoryPaths]
  const selectedEntries = entries
    .map((entry, index) => ({ entry, realPath: resolvedPaths[index] }))
    .filter(({ realPath }) => !selectedDirectoryPaths.some((parentPath) => isPathInside(parentPath, realPath)))
  const roots = archiveRoots(
    selectedEntries.map(({ entry }) => entry),
    directoryPaths
  )
  const cwd = path.parse(selectedEntries[0].realPath).root
  const sourcePaths = selectedEntries.map(({ realPath: entryPath }) => {
    const relativePath = path.relative(cwd, entryPath)
    if (path.isAbsolute(relativePath) || relativePath.startsWith(`..${path.sep}`)) {
      throw new Error('Cannot create a TAR archive from paths on different filesystem roots')
    }
    return relativePath || '.'
  })
  let activeEntry: WriteEntry | undefined
  let validationError: Error | undefined

  const rejectEntry = (error: Error): false => {
    if (!validationError) {
      validationError = error
      queueMicrotask(() => archive.destroy(error))
    }
    return false
  }

  const archive: Pack = create(
    {
      cwd,
      filter: (entryPath, entry) => {
        const realPath = path.resolve(cwd, entryPath)
        const entryType = 'type' in entry ? entry.type : undefined
        const isSymbolicLink = 'type' in entry ? entry.type === 'SymbolicLink' : entry.isSymbolicLink()
        const hasMultipleFileLinks = !('type' in entry) && entry.isFile() && entry.nlink > 1
        if (isSymbolicLink) {
          return rejectEntry(new Error(`TAR symbolic links are not supported: ${realPath}`))
        }
        if (entryType === 'Link' || hasMultipleFileLinks) {
          return rejectEntry(new Error(`TAR hard links are not supported: ${realPath}`))
        }
        return true
      },
      follow: false,
      gzip: compress ? { level: 9 } : false,
      jobs: 1,
      maxReadSize: DEFAULT_HIGH_WATER_MARK,
      strict: true,
      onWriteEntry: (entry) => {
        activeEntry = entry
        entry.path = archiveEntryPath(path.resolve(entry.absolute), roots)
        entry.once('end', () => {
          if (activeEntry === entry) activeEntry = undefined
        })
      }
    },
    sourcePaths
  )

  const onAbort = () => {
    const reason = abortReason(signal)
    activeEntry?.destroy(reason)
    archive.destroy(reason)
  }

  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    const output = createWriteStream(outputPath, { highWaterMark: DEFAULT_HIGH_WATER_MARK })
    if (onProgress || maxArchiveSize !== undefined) {
      await pipeline(archive, createProgressTransform(onProgress, maxArchiveSize, storageQuotaExceededError), output)
    } else {
      await pipeline(archive, output)
    }
    signal?.throwIfAborted()
  } catch (error) {
    if (signal?.aborted) throw abortReason(signal)
    throw validationError || error
  } finally {
    signal?.removeEventListener('abort', onAbort)
    activeEntry?.destroy()
  }
}
