import { DocTextifyOptions } from '../interfaces/doc-textify.interfaces'
import { collectElementText, parseZipXmlEntries } from '../utils/zip-xml'

const SLIDE_PATH = /^ppt\/slides\/slide(\d+)\.xml$/
const NOTES_PATH = /^ppt\/notesSlides\/notesSlide(\d+)\.xml$|^ppt\/slides\/notesSlides\/slide(\d+)\.xml$/

/**
 * Parses a PPTX file
 */
export async function parsePowerPoint(filePath: string, options: DocTextifyOptions): Promise<string> {
  const slideTextMap = new Map<number, string[]>()
  let hasSlide = false

  await parseZipXmlEntries(
    filePath,
    (entryPath) => {
      const slideMatch = SLIDE_PATH.exec(entryPath)
      const match = slideMatch ?? NOTES_PATH.exec(entryPath)
      if (!match) return
      if (slideMatch) hasSlide = true
      const slideNumber = Number(match[1] ?? match[2])
      if (!slideTextMap.has(slideNumber)) slideTextMap.set(slideNumber, [])
      return slideNumber
    },
    (parser, slideNumber) => collectElementText(parser, 'a:t', (text) => slideTextMap.get(slideNumber)!.push(text))
  )

  if (!hasSlide) throw new Error('file seems to be corrupted')
  return [...slideTextMap]
    .sort(([firstSlide], [secondSlide]) => firstSlide - secondSlide)
    .map(([, texts]) => texts.join(options.newlineDelimiter))
    .join(options.newlineDelimiter)
}
