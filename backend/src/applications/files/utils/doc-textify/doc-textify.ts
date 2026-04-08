import fs from 'node:fs/promises'
import { parseExcel } from './adapters/excel'
import { parseHtml } from './adapters/html'
import { parseMarkdown } from './adapters/markdown'
import { parseOpenOffice } from './adapters/open-office'
import { parsePdf } from './adapters/pdf'
import { parsePowerPoint } from './adapters/power-point'
import { parseText } from './adapters/text'
import { parseWord } from './adapters/word'
import { DocTextifyOptions } from './interfaces/doc-textify.interfaces'
import { cleanContent } from './utils/clean'
import { INDEXABLE_EXTENSIONS } from '../../constants/indexing'
import { getExtensionWithoutDot } from '../files'

/** Main: determine parser by extension and dispatch */
export async function docTextify(
  filePath: string,
  options: DocTextifyOptions,
  fileProperties?: { extension?: string; verified?: boolean }
): Promise<string> {
  options = {
    newlineDelimiter: '\n',
    minCharsToExtract: 10,
    ...options
  }

  if (!fileProperties?.verified) {
    try {
      await fs.access(filePath)
    } catch (e) {
      throw new Error(`file does not exist or not accessible : ${filePath} (${e})`)
    }
  }

  const ext = fileProperties?.extension || getExtensionWithoutDot(filePath)

  if (!INDEXABLE_EXTENSIONS.has(ext)) {
    throw new Error(`currently only supports ${[...INDEXABLE_EXTENSIONS].join(',')} files`)
  }

  switch (ext) {
    case 'docx':
      return cleanContent(await parseWord(filePath, options), options)
    case 'pptx':
      return cleanContent(await parsePowerPoint(filePath, options), options)
    case 'xlsx':
      return cleanContent(await parseExcel(filePath, options), options)
    case 'odt':
    case 'odp':
    case 'ods':
      return cleanContent(await parseOpenOffice(filePath, options), options)
    case 'pdf':
      return cleanContent(await parsePdf(filePath, options), options)
    case 'txt':
      return cleanContent(await parseText(filePath), options)
    case 'md':
      return cleanContent(await parseMarkdown(filePath), options)
    case 'html':
    case 'htm':
      return cleanContent(await parseHtml(filePath), options)
    default:
      throw new Error(`no handler found for extension: ${ext}`)
  }
}
