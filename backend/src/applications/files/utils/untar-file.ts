import { createReadStream } from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { extract, type ReadEntry, type Unpack } from 'tar'
import type { FileTaskExtractionEntry } from '../interfaces/file-task.interface'
import { storageQuotaExceededError } from './errors'
import { createProgressTransform, isPathInside } from './files'

export function checkTarEntry(outputDir: string, entry: Pick<ReadEntry, 'type' | 'path' | 'linkpath'>): boolean {
  if (entry.type === 'Link') {
    throw new Error(`Tar entry "${entry.path}" is a hard link`)
  }
  if (entry.type !== 'SymbolicLink') return true
  if (!entry.linkpath) {
    throw new Error(`Tar symlink entry "${entry.path}" has no target`)
  }
  const linkPath = path.resolve(outputDir, entry.path)
  const targetPath = path.resolve(path.dirname(linkPath), entry.linkpath)
  if (!isPathInside(outputDir, linkPath) || !isPathInside(outputDir, targetPath, true)) {
    throw new Error(`Tar symlink entry "${entry.path}" would escape the output directory`)
  }
  return true
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
  let extractedSize = 0
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
        extractedSize += entry.size
        if (maxExtractedSize !== undefined && extractedSize > maxExtractedSize) {
          throw storageQuotaExceededError()
        }
        if (!('type' in entry)) return true
        if (!checkTarEntry(outputDir, entry)) return false
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
