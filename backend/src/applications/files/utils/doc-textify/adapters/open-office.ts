import { DocTextifyOptions } from '../interfaces/doc-textify.interfaces'
import { collectElementText, parseZipXmlEntries } from '../utils/zip-xml'

const MAIN_PATH = /^content\.xml$/
const OBJECT_PATH = /^Object \d+\/content\.xml$/
const TEXT_ELEMENTS = ['text:p', 'text:h'] as const

/**
 * Parses ODT/ODS/ODP
 */
export async function parseOpenOffice(filePath: string, options: DocTextifyOptions): Promise<string> {
  const texts: string[] = []
  const notes: string[] = []
  let hasMain = false

  await parseZipXmlEntries(
    filePath,
    (entryPath) => {
      const isMain = MAIN_PATH.test(entryPath)
      if (!isMain && !OBJECT_PATH.test(entryPath)) return
      if (isMain) hasMain = true
      return isMain
    },
    (parser, isMain) => {
      collectElementText(parser, TEXT_ELEMENTS, (text) => {
        const target = isMain ? texts : notes
        target.push(text)
      })
    }
  )

  if (!hasMain) throw new Error('file seems to be corrupted')
  return texts.concat(notes).join(options.newlineDelimiter)
}
