import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { Entry, open as openZip, Options, ZipFile } from 'yauzl'
import { DEFAULT_HIGH_WATER_MARK } from '../constants/files'
import { makeDir } from './files'

const openZipAsync: (path: string, options: Options) => Promise<ZipFile> = promisify(openZip)

export async function extractZip(filePath: string, outputDir: string): Promise<void> {
  const zipFile = await openZipAsync(filePath, { lazyEntries: true })

  return new Promise((resolve, reject) => {
    zipFile.readEntry()

    zipFile.on('entry', async (entry: Entry) => {
      try {
        // make directory destination
        const fullPath = path.join(outputDir, entry.fileName)
        if (entry.fileName.endsWith('/')) {
          await makeDir(fullPath, true)
          zipFile.readEntry()
        } else {
          // make sure parent exists
          await makeDir(path.dirname(fullPath), true)
          const openReadStream = promisify(zipFile.openReadStream.bind(zipFile))
          const readStream = await openReadStream(entry)
          const writeStream = fs.createWriteStream(fullPath, { highWaterMark: DEFAULT_HIGH_WATER_MARK })

          readStream.on('end', () => zipFile.readEntry())
          readStream.pipe(writeStream)
        }
      } catch (err) {
        reject(err)
      }
    })

    zipFile.on('end', resolve)
    zipFile.on('error', reject)
  })
}
