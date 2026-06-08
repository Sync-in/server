import { createWriteStream } from 'node:fs'
import { lstat } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { create, type WriteEntry } from 'tar'
import { DEFAULT_HIGH_WATER_MARK } from '../constants/files'
import { createProgressTransform, fileName } from './files'

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
      const archivePath = isDirectory ? (entries.length === 1 ? '' : fileName(realPath)) : entry.rootAlias ? entry.name : fileName(realPath)
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

function isPathInside(parentPath: string, candidatePath: string): boolean {
  const relativePath = path.relative(parentPath, candidatePath)
  return relativePath !== '' && !path.isAbsolute(relativePath) && relativePath !== '..' && !relativePath.startsWith(`..${path.sep}`)
}

export async function createTar(
  outputPath: string,
  entries: TarFileEntry[],
  gzip: boolean,
  signal?: AbortSignal,
  onProgress?: (bytes: number) => void
): Promise<void> {
  // Creates a TAR/TGZ archive while node-tar handles recursion, symlinks and file streaming.
  signal?.throwIfAborted()
  if (entries.length === 0) {
    throw new Error('Cannot create a TAR archive without entries')
  }

  const resolvedPaths = entries.map(({ path: entryPath }) => path.resolve(entryPath))
  const stats = await Promise.all(resolvedPaths.map((entryPath) => lstat(entryPath)))
  signal?.throwIfAborted()
  const directoryPaths = new Set(resolvedPaths.filter((_entryPath, index) => stats[index].isDirectory()))
  const selectedEntries = entries
    .map((entry, index) => ({ entry, realPath: resolvedPaths[index] }))
    .filter(({ realPath }) => !resolvedPaths.some((parentPath) => directoryPaths.has(parentPath) && isPathInside(parentPath, realPath)))
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

  const archive = create(
    {
      cwd,
      filter: (_entryPath, entry) => {
        // Archive hard links as independent files instead of TAR Link entries.
        entry.nlink = 1
        return true
      },
      follow: false,
      gzip: gzip ? { level: 9 } : false,
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
    if (onProgress) {
      await pipeline(archive, createProgressTransform(onProgress), output)
    } else {
      await pipeline(archive, output)
    }
    signal?.throwIfAborted()
  } catch (error) {
    if (signal?.aborted) throw abortReason(signal)
    throw error
  } finally {
    signal?.removeEventListener('abort', onAbort)
    activeEntry?.destroy()
  }
}
