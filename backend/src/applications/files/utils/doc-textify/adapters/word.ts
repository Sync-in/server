import { promisify } from 'node:util'
import sax from 'sax'
import { Entry, open as openZip, Options, ZipFile } from 'yauzl'
import { DocTextifyOptions } from '../interfaces/doc-textify.interfaces'

const openZipAsync: (path: string, options: Options) => Promise<ZipFile> = promisify(openZip)

/**
 * Parses a DOCX file
 */
export async function parseWord(filePath: string, options: DocTextifyOptions): Promise<string> {
  // Patterns for main document, footnotes and endnotes
  const mainRegex = /^word\/document(?:\d*)\.xml$/
  const footnotesRegex = /^word\/footnotes(?:\d*)\.xml$/
  const endnotesRegex = /^word\/endnotes(?:\d*)\.xml$/
  const texts: string[] = []
  let hasMain = false

  // 1. Open the DOCX (ZIP) in lazyEntries mode
  const zipFile = await openZipAsync(filePath, { lazyEntries: true })

  return new Promise<string>((resolve, reject) => {
    zipFile.readEntry()

    zipFile.on('entry', (entry: Entry) => {
      const path = entry.fileName

      // 2. Only process document, footnotes, endnotes parts
      if (!mainRegex.test(path) && !footnotesRegex.test(path) && !endnotesRegex.test(path)) {
        zipFile.readEntry()
        return
      }

      if (mainRegex.test(path)) {
        hasMain = true
      }

      // 3. Open a read stream for this entry
      zipFile.openReadStream(entry, (err, readStream) => {
        if (err) {
          zipFile.close()
          return reject(err)
        }

        // 4. SAX parser to extract <w:t> text nodes
        const parser = sax.createStream(true)
        let buffer = ''

        parser.on('error', (parseErr) => {
          readStream.destroy()
          zipFile.close()
          reject(parseErr)
        })

        parser.on('opentag', (node) => {
          // Start buffering when encountering a text tag
          if (node.name === 'w:t') {
            buffer = ''
          }
        })

        parser.on('text', (txt) => {
          buffer += txt
        })

        parser.on('closetag', (name) => {
          // On closing a text tag, store its content
          if (name === 'w:t') {
            texts.push(buffer)
          }
        })

        readStream
          .on('error', (streamErr) => {
            zipFile.close()
            reject(streamErr)
          })
          .on('end', () => {
            // Move on to the next entry
            zipFile.readEntry()
          })
          .pipe(parser)
      })
    })

    zipFile.on('end', () => {
      zipFile.close()
      // 5. Ensure at least the main document was found
      if (!hasMain) {
        return reject(new Error('file seems to be corrupted'))
      }
      // 6. Return all collected text joined by the delimiter
      resolve(texts.join(options.newlineDelimiter))
    })

    zipFile.on('error', (zipErr) => {
      zipFile.close()
      reject(zipErr)
    })
  })
}
