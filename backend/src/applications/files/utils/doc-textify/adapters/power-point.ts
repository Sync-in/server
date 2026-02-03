import { promisify } from 'node:util'
import sax from 'sax'
import { Entry, open as openZip, Options, ZipFile } from 'yauzl'
import { DocTextifyOptions } from '../interfaces/doc-textify.interfaces'

const openZipAsync: (path: string, options: Options) => Promise<ZipFile> = promisify(openZip)

/**
 * Parses a PPTX file
 */
export async function parsePowerPoint(filePath: string, options: DocTextifyOptions): Promise<string> {
  // Regex to match slide and notes XML, capturing the slide index
  const slidesRegex = /^ppt\/slides\/slide(\d+)\.xml$/
  const notesRegex = /^ppt\/notesSlides\/notesSlide(\d+)\.xml$|^ppt\/slides\/notesSlides\/slide(\d+)\.xml$/

  // Map of slide index -> array of text fragments
  const slideTextMap: Record<number, string[]> = {}
  let hasSlide = false

  // 1. Open the PPTX (ZIP) in lazyEntries mode
  const zipFile = await openZipAsync(filePath, { lazyEntries: true })

  return new Promise<string>((resolve, reject) => {
    zipFile.readEntry()

    zipFile.on('entry', (entry: Entry) => {
      const path = entry.fileName
      let match: RegExpExecArray | null

      // Skip if not a slide or a note
      const isSlide = slidesRegex.test(path)
      const isNote = notesRegex.test(path)
      if (!isSlide && !isNote) {
        zipFile.readEntry()
        return
      }

      // Capture the regex match and flag that we've seen a slide
      if (isSlide) {
        match = slidesRegex.exec(path)!
        hasSlide = true
      } else {
        match = notesRegex.exec(path)!
      }

      // parse the slide number from whichever capture is defined
      const slideNum = parseInt(match[1] || match[2]!, 10)
      if (!slideTextMap[slideNum]) slideTextMap[slideNum] = []

      // 2. Open a read stream for this entry
      zipFile.openReadStream(entry, (err, readStream) => {
        if (err) {
          zipFile.close()
          return reject(err)
        }

        // 3. SAX parser to extract <a:t> text nodes
        const parser = sax.createStream(true)
        let buffer = ''

        parser.on('error', (parseErr) => {
          readStream.destroy()
          zipFile.close()
          reject(parseErr)
        })

        parser.on('opentag', (node) => {
          if (node.name === 'a:t') {
            buffer = ''
          }
        })

        parser.on('text', (txt) => {
          buffer += txt
        })

        parser.on('closetag', (name) => {
          if (name === 'a:t') {
            slideTextMap[slideNum].push(buffer)
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
      // 4. Ensure at least one slide was found
      if (!hasSlide) {
        return reject(new Error('file seems to be corrupted'))
      }

      // 5. Build final output by ascending slide number
      const sortedSlides = Object.keys(slideTextMap)
        .map((n) => parseInt(n, 10))
        .sort((a, b) => a - b)

      const result = sortedSlides.map((num) => slideTextMap[num].join(options.newlineDelimiter)).join(options.newlineDelimiter)

      resolve(result)
    })

    zipFile.on('error', (zipErr) => {
      zipFile.close()
      reject(zipErr)
    })
  })
}
