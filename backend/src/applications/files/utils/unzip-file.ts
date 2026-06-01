import fs from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import { Entry, open as openZip, Options, ZipFile } from 'yauzl'
import { DEFAULT_HIGH_WATER_MARK } from '../constants/files'
import { storageQuotaExceededError } from './errors'
import { isPathInside, makeDir } from './files'

const openZipAsync: (path: string, options: Options) => Promise<ZipFile> = promisify(openZip)

export async function extractZip(filePath: string, outputDir: string, maxExtractedSize?: number): Promise<void> {
  // Reject entries whose actual decompressed size differs from their metadata.
  const zipFile = await openZipAsync(filePath, { lazyEntries: true, validateEntrySizes: true })
  const openReadStream = promisify(zipFile.openReadStream.bind(zipFile))
  const resolvedOutputDir = path.resolve(outputDir)
  let extractedSize = 0

  return new Promise((resolve, reject) => {
    zipFile.on('entry', async (entry: Entry) => {
      try {
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
          zipFile.readEntry()
        } else {
          // make sure parent exists
          await makeDir(path.dirname(fullPath), true)
          const readStream = await openReadStream(entry)
          await pipeline(readStream, fs.createWriteStream(fullPath, { highWaterMark: DEFAULT_HIGH_WATER_MARK }))
          zipFile.readEntry()
        }
      } catch (err) {
        zipFile.close()
        reject(err)
      }
    })

    zipFile.on('end', resolve)
    zipFile.on('error', reject)
    zipFile.readEntry()
  })
}
