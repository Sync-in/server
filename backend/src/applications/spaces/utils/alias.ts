import { regExpLetterOrNumber, regExpNumberSuffix } from '../../../common/shared.js'
import { SPACE_ALIAS } from '../constants/spaces.js'

export interface UniqueAliasOptions {
  extension?: string
  /** Remove the existing numeric suffix before checking the base alias, then try -1, -2, etc. */
  replaceCount?: boolean
}

const MAX_ALIAS_LENGTH = 255
const FALLBACK_ALIAS = 'alias'
const aliasSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

function truncateAliasPart(value: string, maxLength: number): string {
  let prefix = ''
  let length = 0
  for (const { segment } of aliasSegmenter.segment(value)) {
    length += Array.from(segment).length
    if (length > maxLength) break
    prefix += segment
  }
  return prefix
}

export async function createUniqueAlias(
  alias: string,
  aliasExists: (alias: string) => Promise<unknown>,
  { extension = '', replaceCount = false }: UniqueAliasOptions = {}
): Promise<string> {
  const originalAlias = replaceCount ? alias.replace(regExpNumberSuffix, '') : alias
  const firstGrapheme = aliasSegmenter.segment(originalAlias).containing(0)?.segment ?? ''
  const firstGraphemeLength = Array.from(firstGrapheme).length
  for (let count = 0; ; count += 1) {
    const suffix = count ? `-${count}` : ''
    // VARCHAR(255) counts Unicode code points, not UTF-8 bytes or UTF-16 code units.
    const remainingLength = MAX_ALIAS_LENGTH - suffix.length
    const minimumBaseLength = firstGraphemeLength > 0 && firstGraphemeLength <= remainingLength ? firstGraphemeLength : FALLBACK_ALIAS.length
    // Keep a usable base even when the extension or its first grapheme exceeds the budget.
    let candidateExtension = truncateAliasPart(extension, remainingLength - minimumBaseLength).replace(/^\.$/, '')
    let prefix = truncateAliasPart(originalAlias, remainingLength - Array.from(candidateExtension).length)
    if (!regExpLetterOrNumber.test(prefix)) {
      prefix = FALLBACK_ALIAS
      candidateExtension = truncateAliasPart(extension, remainingLength - FALLBACK_ALIAS.length).replace(/^\.$/, '')
    }
    const candidate = `${prefix}${suffix}${candidateExtension}`
    if (candidate !== SPACE_ALIAS.PERSONAL && !(await aliasExists(candidate))) return candidate
  }
}
