import { DocTextifyOptions } from '../interfaces/doc-textify.interfaces'
import { collectElementText, parseZipXmlEntries } from '../utils/zip-xml'

const SHEET_PATH = /^xl\/worksheets\/sheet\d+\.xml$/
const SHARED_STRINGS_PATH = 'xl/sharedStrings.xml'

/**
 * Parse XLSX files
 */
export async function parseExcel(filePath: string, options: DocTextifyOptions): Promise<string> {
  const texts: string[] = []
  let hasSheet = false

  await parseZipXmlEntries(
    filePath,
    (entryPath) => {
      const isSheet = SHEET_PATH.test(entryPath)
      if (!isSheet && entryPath !== SHARED_STRINGS_PATH) return
      if (isSheet) hasSheet = true
      return true
    },
    (parser) => collectElementText(parser, 't', (text) => texts.push(text))
  )

  if (!hasSheet) throw new Error('file seems to be corrupted')
  return texts.join(options.newlineDelimiter)
}
