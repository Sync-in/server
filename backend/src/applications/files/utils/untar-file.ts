import { createReadStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { extract, type ReadEntry, type Unpack } from 'tar'
import type { FileTaskExtractionEntry } from '../interfaces/file-task.interface'
import { storageQuotaExceededError } from './errors'
import { createProgressTransform, createSizeLimiter } from './files'

export function checkTarEntry(entry: Pick<ReadEntry, 'type' | 'path'>): void {
  if (entry.type === 'Link') {
    throw new Error(`Tar entry "${entry.path}" is a hard link`)
  }
  if (entry.type === 'SymbolicLink') {
    // TAR links are rejected instead of being restored into user storage.
    throw new Error(`Tar entry "${entry.path}" is a symbolic link`)
  }
}

export function isTarDirectory(type: ReadEntry['type']): boolean {
  return type === 'Directory' || type === 'GNUDumpDir'
}

export async function extractTar(
  filePath: string,
  outputDir: string,
  gzip: boolean,
  maxExtractedSize?: number,
  signal?: AbortSignal,
  onEntry?: (entry: FileTaskExtractionEntry) => void
): Promise<void> {
  let validationError: Error | undefined
  const checkExtractedSize = maxExtractedSize === undefined ? undefined : createSizeLimiter(maxExtractedSize, storageQuotaExceededError)
  const srcStream = createReadStream(filePath)

  const abortExtraction = (error: Error): false => {
    // Stop both the file read and node-tar parser so a rejected TAR.GZ is not decompressed to the end.
    validationError = error
    srcStream.destroy(error)
    extractStream.abort(error)
    return false
  }

  const extractStream: Unpack = extract({
    cwd: outputDir,
    gzip,
    preserveOwner: false,
    preservePaths: false,
    strict: true,
    transform: onEntry
      ? (entry) => {
          let extractedEntrySize = 0
          return createProgressTransform((bytes) => {
            extractedEntrySize += bytes
            onEntry({ path: entry.path, isDirectory: false, size: extractedEntrySize })
          }) as unknown as ReadEntry
        }
      : undefined,
    filter: (_path, entry) => {
      if (validationError) return false
      try {
        // node-tar invokes the filter before writing an entry, so metadata can enforce the known quota.
        checkExtractedSize?.(entry.size)
        if (!('type' in entry)) return true
        checkTarEntry(entry)
        onEntry?.({ path: entry.path, isDirectory: isTarDirectory(entry.type), size: 0 })
        return true
      } catch (e) {
        return abortExtraction(e as Error)
      }
    }
  })
  try {
    await pipeline(srcStream, extractStream, { signal })
  } catch (e) {
    throw validationError || e
  }
}
