import { regexpEscape } from '../../../common/functions'
import { MIN_CHARS_TO_SEARCH } from '../constants/indexing'
import { SEARCH_FILES_DEFAULT_LIMIT, SEARCH_FILES_MAX_LIMIT, SEARCH_FILES_MIN_LIMIT } from '../constants/search'

const regexMatchSearchBoolean = new RegExp(`([+-]?)(?:"([^"]+)"|(\\S+))`)
const regexMatchesSearchBoolean = new RegExp(regexMatchSearchBoolean.source, 'g')
const booleanOperators = new Set(['+', '-', '<', '>', '~', '*'])
const UNICODE_WORD_CHAR = '[\\p{L}\\p{N}]'
const LIKE_SEARCH_CHAR =
  '[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}\\p{Script=Thai}\\p{Script=Lao}\\p{Script=Khmer}\\p{Script=Myanmar}]'
const regexRequiresLikeSearch = new RegExp(LIKE_SEARCH_CHAR, 'u')
const accentToBaseMap = new Map<string, string>([
  ['a', '[aàáâä]'],
  ['e', '[eèéêë]'],
  ['i', '[iìíîï]'],
  ['o', '[oòóôö]'],
  ['u', '[uùúûü]'],
  ['c', '[cç]'],
  ['n', '[nñ]'],
  ['s', '[sš]'],
  ['z', '[zž]'],
  ['y', '[yýÿ]']
])

export interface SearchTerm {
  rawValue: string
  regexpValue: string
  operator: 'required' | 'excluded' | 'optional'
  requiresLike: boolean
}

export class MaxSortedList {
  public data: [number, string][] = []
  public nbItems: number

  constructor(nbItems: number) {
    this.nbItems = nbItems
  }

  insert(item: [number, string]) {
    if (this.data.length === 0) {
      this.data.push(item)
      return
    }
    // if score is smaller or the score already stored for another string ignore it and keep the first matches.
    if (this.data.length === this.nbItems && (item[0] < this.data[this.data.length - 1][0] || this.data.some(([num]) => num === item[0]))) {
      return
    }
    // insert data ordered by highest score
    const index: number = this.data.findIndex(([num]) => num < item[0])
    if (index === -1) {
      this.data.push(item)
    } else {
      this.data.splice(index, 0, item)
    }
    // remove the smaller code
    if (this.data.length > this.nbItems) {
      this.data.pop()
    }
  }
}

export function analyzeTerms(search: string, onlyAllowNegative = false, escapeForRegexp = true): string[] {
  return parseSearchTerms(search)
    .filter(({ operator }) => (onlyAllowNegative ? operator === 'excluded' : operator !== 'excluded'))
    .map((term) => (escapeForRegexp ? term.regexpValue : term.rawValue))
}

export function genTermsPattern(terms: string[]): string {
  return terms.map((t) => genAccentInsensitiveRegexpPattern(t)).join('|')
}

export function genRegexPositiveAndNegativeTerms(search: string): RegExp {
  const searchTerms = parseSearchTerms(search)
  const positiveTerms = searchTerms.filter(({ operator }) => operator !== 'excluded').map(({ regexpValue }) => regexpValue)
  const negativeTerms = searchTerms.filter(({ operator }) => operator === 'excluded').map(({ regexpValue }) => regexpValue)
  const p = positiveTerms
    .map((t) => genAccentInsensitiveRegexpPattern(t))
    .map((t) => `(?=.*${termBoundaryPattern(t)})`)
    .join('')
  if (!negativeTerms.length) return new RegExp(p, 'iu')
  const n = negativeTerms
    .map((t) => genAccentInsensitiveRegexpPattern(t))
    .map((t) => termBoundaryPattern(t, true))
    .join('|')
  return new RegExp(`^${p}(?!.*(${n})).*$`, 'iu')
}

export function requiresLikeSearch(input: string): boolean {
  return regexRequiresLikeSearch.test(input)
}

export function parseSearchTerms(search: string): SearchTerm[] {
  return (search.match(regexMatchesSearchBoolean) || []).flatMap((match: string) => {
    const [, operator, quoted, unquoted] = match.match(regexMatchSearchBoolean)
    let rawValue = (quoted || unquoted).trim()
    while (booleanOperators.has(rawValue[0])) {
      rawValue = rawValue.substring(1)
    }
    if (rawValue[rawValue.length - 1] === '*') {
      rawValue = rawValue.substring(0, rawValue.length - 1)
    }
    if (rawValue.length < MIN_CHARS_TO_SEARCH) {
      return []
    }
    const searchOperator: SearchTerm['operator'] = operator === '+' ? 'required' : operator === '-' ? 'excluded' : 'optional'
    return [
      {
        rawValue,
        regexpValue: escapeSearchTermRegexp(rawValue),
        operator: searchOperator,
        requiresLike: requiresLikeSearch(rawValue)
      }
    ]
  })
}

export function likeSearchTermStartPattern(): string {
  return `(?=${LIKE_SEARCH_CHAR})`
}

export function normalizeSearchLimit(limit?: number): number {
  if (!Number.isInteger(limit)) return SEARCH_FILES_DEFAULT_LIMIT
  return Math.min(Math.max(limit, SEARCH_FILES_MIN_LIMIT), SEARCH_FILES_MAX_LIMIT)
}

function termBoundaryPattern(term: string, endBoundary = false): string {
  if (requiresLikeSearch(term)) {
    return term
  }
  return `(?<!${UNICODE_WORD_CHAR})${term}${endBoundary ? `(?!${UNICODE_WORD_CHAR})` : ''}`
}

function genAccentInsensitiveRegexpPattern(input: string): string {
  /* Allow to catch all terms with accents or not */
  return input
    .split('')
    .map((char: string) => accentToBaseMap.get(char) || char)
    .join('')
}

function escapeSearchTermRegexp(input: string): string {
  return input.replace(regexpEscape, '\\$&')
}
