import fs from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import { Entry, open as openZip, Options, ZipFile } from 'yauzl'
import { DEFAULT_HIGH_WATER_MARK } from '../constants/files'
import type { FileTaskExtractionEntry } from '../interfaces/file-task.interface'
import { storageQuotaExceededError } from './errors'
import { createProgressTransform, isPathInside, makeDir } from './files'

const openZipAsync: (path: string, options: Options) => Promise<ZipFile> = promisify(openZip)

export async function extractZip(
  filePath: string,
  outputDir: string,
  maxExtractedSize?: number,
  signal?: AbortSignal,
  onEntry?: (entry: FileTaskExtractionEntry) => void
): Promise<void> {
  // Reject entries whose actual decompressed size differs from their metadata.
  const zipFile = await openZipAsync(filePath, { lazyEntries: true, validateEntrySizes: true })
  const openReadStream = promisify(zipFile.openReadStream.bind(zipFile))
  const resolvedOutputDir = path.resolve(outputDir)
  let extractedSize = 0

  return new Promise((resolve, reject) => {
    let settled = false
    const cleanup = () => signal?.removeEventListener('abort', onAbort)
    const rejectOnce = (err: unknown) => {
      if (settled) return
      settled = true
      cleanup()
      zipFile.close()
      reject(err)
    }
    const onAbort = () => rejectOnce(signal?.reason)
    signal?.addEventListener('abort', onAbort, { once: true })

    zipFile.on('entry', async (entry: Entry) => {
      try {
        signal?.throwIfAborted()
        // Check the cumulative size before opening the entry stream to avoid writing beyond the known quota.
        extractedSize += entry.uncompressedSize
        if (maxExtractedSize !== undefined && extractedSize > maxExtractedSize) {
          throw storageQuotaExceededError()
        }
        const isDir = entry.fileName.endsWith('/')
        const fullPath = path.resolve(resolvedOutputDir, entry.fileName)
        if (!isPathInside(resolvedOutputDir, fullPath, isDir)) {
          throw new Error(`Zip entry "${entry.fileName}" would escape the output directory`)
        }
        if (isDir) {
          await makeDir(fullPath, true)
          onEntry?.({ path: entry.fileName, isDirectory: true, size: 0 })
          zipFile.readEntry()
        } else {
          // make sure parent exists
          await makeDir(path.dirname(fullPath), true)
          const readStream = await openReadStream(entry)
          const writeStream = fs.createWriteStream(fullPath, { highWaterMark: DEFAULT_HIGH_WATER_MARK })
          if (onEntry) {
            let extractedEntrySize = 0
            onEntry({ path: entry.fileName, isDirectory: false, size: 0 })
            await pipeline(
              readStream,
              createProgressTransform((bytes) => {
                extractedEntrySize += bytes
                onEntry({ path: entry.fileName, isDirectory: false, size: extractedEntrySize })
              }),
              writeStream,
              { signal }
            )
          } else {
            await pipeline(readStream, writeStream, { signal })
          }
          zipFile.readEntry()
        }
      } catch (err) {
        rejectOnce(err)
      }
    })

    zipFile.on('end', () => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    })
    zipFile.on('error', rejectOnce)
    try {
      signal?.throwIfAborted()
      zipFile.readEntry()
    } catch (err) {
      rejectOnce(err)
    }
  })
}
