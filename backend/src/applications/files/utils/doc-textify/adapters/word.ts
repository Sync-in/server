import { DocTextifyOptions } from '../interfaces/doc-textify.interfaces'
import { collectElementText, parseZipXmlEntries } from '../utils/zip-xml'

const MAIN_PATH = /^word\/document(?:\d*)\.xml$/
const FOOTNOTES_PATH = /^word\/footnotes(?:\d*)\.xml$/
const ENDNOTES_PATH = /^word\/endnotes(?:\d*)\.xml$/

/**
 * Parses a DOCX file
 */
export async function parseWord(filePath: string, options: DocTextifyOptions): Promise<string> {
  const texts: string[] = []
  let hasMain = false

  await parseZipXmlEntries(
    filePath,
    (entryPath) => {
      const isMain = MAIN_PATH.test(entryPath)
      if (!isMain && !FOOTNOTES_PATH.test(entryPath) && !ENDNOTES_PATH.test(entryPath)) return
      if (isMain) hasMain = true
      return true
    },
    (parser) => collectElementText(parser, 'w:t', (text) => texts.push(text))
  )

  if (!hasMain) throw new Error('file seems to be corrupted')
  return texts.join(options.newlineDelimiter)
}
