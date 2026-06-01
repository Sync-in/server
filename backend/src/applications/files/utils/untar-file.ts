import { createReadStream } from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { extract, type ReadEntry, type Unpack } from 'tar'
import { storageQuotaExceededError } from './errors'
import { isPathInside } from './files'

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

export async function extractTar(filePath: string, outputDir: string, gzip: boolean, maxExtractedSize?: number): Promise<void> {
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
    filter: (_path, entry) => {
      if (validationError) return false
      try {
        // node-tar invokes the filter before writing an entry, so metadata can enforce the known quota.
        extractedSize += entry.size
        if (maxExtractedSize !== undefined && extractedSize > maxExtractedSize) {
          throw storageQuotaExceededError()
        }
        return !('type' in entry) || checkTarEntry(outputDir, entry)
      } catch (e) {
        return abortExtraction(e as Error)
      }
    }
  })
  try {
    await pipeline(srcStream, extractStream)
  } catch (e) {
    throw validationError || e
  }
}
