import { BlobReader, type FileEntry, ZipReader } from '@zip.js/zip.js'
import { createWriteStream, openAsBlob } from 'node:fs'
import path from 'node:path'
import { Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { DEFAULT_HIGH_WATER_MARK } from '../constants/files'
import type { FileTaskExtractionEntry } from '../interfaces/file-task.interface'
import { storageQuotaExceededError } from './errors'
import { createProgressTransform, createSizeLimiter, isPathInside, makeDir } from './files'

const UNIX_FILE_TYPE_MASK = 0o170000
const UNIX_SYMBOLIC_LINK = 0o120000

function abortReason(signal?: AbortSignal): Error {
  return signal?.reason instanceof Error ? signal.reason : new Error('Cancelled')
}

function isSymbolicLink(entry: FileEntry): boolean {
  // ZIP symlinks are rejected instead of being restored or silently extracted as regular files.
  return entry.unixMode !== undefined && (entry.unixMode & UNIX_FILE_TYPE_MASK) === UNIX_SYMBOLIC_LINK
}

function normalizeEntryPath(entryPath: string): string {
  const normalizedPath = entryPath.replace(/\\/g, '/')
  if (normalizedPath.split('/').includes('..')) {
    throw new Error(`invalid relative path: ${normalizedPath}`)
  }
  if (path.posix.isAbsolute(normalizedPath) || /^[a-zA-Z]:/.test(normalizedPath)) {
    throw new Error(`absolute path: ${normalizedPath}`)
  }
  return normalizedPath
}

export async function extractZip(
  filePath: string,
  outputDir: string,
  maxExtractedSize?: number,
  signal?: AbortSignal,
  onEntry?: (entry: FileTaskExtractionEntry) => void
): Promise<void> {
  signal?.throwIfAborted()
  const zipReader = new ZipReader(new BlobReader(await openAsBlob(filePath)), { signal, useWebWorkers: false })
  const resolvedOutputDir = path.resolve(outputDir)
  const checkDeclaredSize = maxExtractedSize === undefined ? undefined : createSizeLimiter(maxExtractedSize, storageQuotaExceededError)
  const checkExtractedSize = maxExtractedSize === undefined ? undefined : createSizeLimiter(maxExtractedSize, storageQuotaExceededError)

  try {
    for await (const entry of zipReader.getEntriesGenerator()) {
      signal?.throwIfAborted()
      checkDeclaredSize?.(entry.uncompressedSize)
      const entryPath = normalizeEntryPath(entry.filename)
      const fullPath = path.resolve(resolvedOutputDir, entryPath)
      if (!isPathInside(resolvedOutputDir, fullPath, entry.directory)) {
        throw new Error(`Zip entry "${entryPath}" would escape the output directory`)
      }

      if (entry.directory) {
        await makeDir(fullPath, true)
        onEntry?.({ path: entryPath, isDirectory: true, size: 0 })
        continue
      }

      const fileEntry = entry as FileEntry
      if (isSymbolicLink(fileEntry)) {
        throw new Error(`ZIP symbolic links are not supported: ${entryPath}`)
      }
      await makeDir(path.dirname(fullPath), true)
      const writeStream = createWriteStream(fullPath, { highWaterMark: DEFAULT_HIGH_WATER_MARK })
      let extractedEntrySize = 0
      const progressTransform =
        onEntry || checkExtractedSize
          ? createProgressTransform((bytes) => {
              checkExtractedSize?.(bytes)
              if (!onEntry) return
              extractedEntrySize += bytes
              onEntry({ path: entryPath, isDirectory: false, size: extractedEntrySize })
            })
          : undefined
      const entryOutput = progressTransform ?? writeStream
      const outputPromise = progressTransform ? pipeline(progressTransform, writeStream) : undefined
      void outputPromise?.catch(() => undefined)
      try {
        onEntry?.({ path: entryPath, isDirectory: false, size: 0 })
        await fileEntry.getData(Writable.toWeb(entryOutput), { signal })
        await outputPromise
      } catch (error) {
        const reason = error instanceof Error ? error : new Error(String(error))
        entryOutput.destroy(reason)
        if (progressTransform) writeStream.destroy(reason)
        await outputPromise?.catch(() => undefined)
        throw error
      }
    }
  } catch (error) {
    if (signal?.aborted) throw abortReason(signal)
    throw error
  } finally {
    await zipReader.close()
  }
}
