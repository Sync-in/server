import { promisify } from 'node:util'
import sax from 'sax'
import { Entry, open as openZip, Options, ZipFile } from 'yauzl'
import { DocTextifyOptions } from '../interfaces/doc-textify.interfaces'

const openZipAsync: (path: string, options: Options) => Promise<ZipFile> = promisify(openZip)

/**
 * Parses ODT/ODS/ODP
 */
export async function parseOpenOffice(filePath: string, options: DocTextifyOptions): Promise<string> {
  // Paths to process: main content and any embedded object content
  const mainPath = /^content\.xml$/
  const objectPath = /^Object \d+\/content\.xml$/

  const texts: string[] = []
  const notes: string[] = []
  let hasMain = false

  // Open the package as a ZIP in lazyEntries mode
  const zipFile = await openZipAsync(filePath, { lazyEntries: true })

  return new Promise<string>((resolve, reject) => {
    zipFile.readEntry()

    zipFile.on('entry', (entry: Entry) => {
      const path = entry.fileName

      // Only process content.xml or object/.../content.xml
      const isMain = mainPath.test(path)
      const isObject = objectPath.test(path)
      if (!isMain && !isObject) {
        zipFile.readEntry()
        return
      }

      if (isMain) {
        hasMain = true
      }

      zipFile.openReadStream(entry, (err, readStream) => {
        if (err) {
          zipFile.close()
          return reject(err)
        }

        const parser = sax.createStream(true)
        let buffer = ''
        let reading = false

        parser.on('error', (parseErr) => {
          readStream.destroy()
          zipFile.close()
          reject(parseErr)
        })

        parser.on('opentag', (node) => {
          // Start buffering when entering a paragraph or header
          if (node.name === 'text:p' || node.name === 'text:h') {
            reading = true
            buffer = ''
          }
        })

        parser.on('text', (txt) => {
          if (reading) {
            buffer += txt
          }
        })

        parser.on('closetag', (name) => {
          // On closing a paragraph or header, store the text
          if ((name === 'text:p' || name === 'text:h') && reading) {
            if (isMain) {
              texts.push(buffer)
            } else {
              notes.push(buffer)
            }
            reading = false
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
      // Ensure main content was found
      if (!hasMain) {
        return reject(new Error('file seems to be corrupted'))
      }
      // Optionally append notes at the end
      const all = texts.concat(notes)
      resolve(all.join(options.newlineDelimiter))
    })

    zipFile.on('error', (zipErr) => {
      zipFile.close()
      reject(zipErr)
    })
  })
}
