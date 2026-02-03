import { promisify } from 'node:util'
import sax from 'sax'
import { open as openZip, Options, ZipFile } from 'yauzl'
import { DocTextifyOptions } from '../interfaces/doc-textify.interfaces'

const openZipAsync: (path: string, options: Options) => Promise<ZipFile> = promisify(openZip)

/**
 * Parse XLSX files
 */
export async function parseExcel(filePath: string, options: DocTextifyOptions): Promise<string> {
  const sheetRegex = /^xl\/worksheets\/sheet\d+\.xml$/
  const sharedPath = 'xl/sharedStrings.xml'
  const texts: string[] = []
  let hasSheet = false

  // Open the ZIP in lazyEntries mode
  const zipFile = await openZipAsync(filePath, { lazyEntries: true })

  return new Promise<string>((resolve, reject) => {
    zipFile.readEntry()

    zipFile.on('entry', (entry) => {
      const path = entry.fileName

      // Only process sheets and sharedStrings
      if (!sheetRegex.test(path) && path !== sharedPath) {
        zipFile.readEntry() // <–– call directly, no unused-expression
        return
      }

      if (sheetRegex.test(path)) {
        hasSheet = true
      }

      zipFile.openReadStream(entry, (err, readStream) => {
        if (err) {
          zipFile.close()
          return reject(err)
        }

        const parser = sax.createStream(true)
        let buffer = ''

        parser.on('error', (parseErr) => {
          readStream.destroy()
          zipFile.close()
          reject(parseErr)
        })

        parser.on('opentag', (node) => {
          if (node.name === 't') buffer = ''
        })
        parser.on('text', (txt) => {
          buffer += txt
        })
        parser.on('closetag', (name) => {
          if (name === 't') {
            texts.push(buffer)
          }
        })

        readStream
          .on('error', (streamErr) => {
            zipFile.close()
            reject(streamErr)
          })
          .on('end', () => {
            zipFile.readEntry()
          })
          .pipe(parser)
      })
    })

    zipFile.on('end', () => {
      zipFile.close()
      // No sheets found → corrupted file
      if (!hasSheet) {
        return reject(new Error('file seems to be corrupted'))
      }
      resolve(texts.join(options.newlineDelimiter))
    })

    zipFile.on('error', (zipErr) => {
      zipFile.close()
      reject(zipErr)
    })
  })
}
