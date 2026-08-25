import { regexpEscape } from '../../../common/functions'
import { MIN_CHARS_TO_SEARCH } from '../constants/indexing'
import { SEARCH_FILES_DEFAULT_LIMIT, SEARCH_FILES_MAX_LIMIT, SEARCH_FILES_MIN_LIMIT } from '../constants/search'
import type { FilesSearchQuery, FilesSearchTerm } from '../interfaces/files-search-query.interface'

const SEARCH_TERMS_PATTERN = /([+-]?)(?:"([^"]+)"|(\S+))/g
const LEADING_BOOLEAN_OPERATORS = new Set(['+', '-', '<', '>', '~', '*'])
const UNICODE_WORD_CHAR = '[\\p{L}\\p{M}\\p{N}]'
const LIKE_SEARCH_CHAR =
  '[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}\\p{Script=Thai}\\p{Script=Lao}\\p{Script=Khmer}\\p{Script=Myanmar}]'
const REQUIRES_LIKE_SEARCH_PATTERN = new RegExp(LIKE_SEARCH_CHAR, 'u')
const ACCENT_INSENSITIVE_CHARACTER_GROUPS = ['aàáâä', 'eèéêë', 'iìíîï', 'oòóôö', 'uùúûü', 'cç', 'nñ', 'sš', 'zž', 'yýÿ']
const ACCENT_INSENSITIVE_PATTERN_BY_CHARACTER = new Map<string, string>(
  ACCENT_INSENSITIVE_CHARACTER_GROUPS.flatMap((characters) => {
    const pattern = `[${characters}]`
    return [...characters].map((character) => [character, pattern] as const)
  })
)

export class MaxSortedList<T = string> {
  public data: [number, T][] = []
  public nbItems: number

  constructor(nbItems: number) {
    this.nbItems = nbItems
  }

  insert(item: [number, T]) {
    if (this.data.length === 0) {
      this.data.push(item)
      return
    }
    // If the score is smaller or already stored for another item, keep the first matches.
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

export function parseFilesSearchQuery(search: string): FilesSearchQuery {
  const terms = parseSearchTerms(search)
  return {
    terms,
    positiveTerms: terms.filter(({ operator }) => operator !== 'excluded'),
    requiredTerms: terms.filter(({ operator }) => operator === 'required'),
    optionalTerms: terms.filter(({ operator }) => operator === 'optional'),
    excludedTerms: terms.filter(({ operator }) => operator === 'excluded')
  }
}

export function parseSearchTerms(search: string): FilesSearchTerm[] {
  const terms: FilesSearchTerm[] = []
  for (const [, operator, quotedValue, unquotedValue] of search.matchAll(SEARCH_TERMS_PATTERN)) {
    const quoted = quotedValue !== undefined
    let rawValue = (quotedValue || unquotedValue).trim()
    while (LEADING_BOOLEAN_OPERATORS.has(rawValue[0])) {
      rawValue = rawValue.substring(1)
    }
    const wildcard = rawValue.endsWith('*')
    if (wildcard) {
      rawValue = rawValue.substring(0, rawValue.length - 1)
    }
    if (rawValue.length < MIN_CHARS_TO_SEARCH) {
      continue
    }
    const searchOperator: FilesSearchTerm['operator'] = operator === '+' ? 'required' : operator === '-' ? 'excluded' : 'optional'
    terms.push({
      rawValue,
      regexpValue: escapeSearchTermRegexp(rawValue),
      operator: searchOperator,
      requiresLike: requiresLikeSearch(rawValue),
      quoted,
      wildcard
    })
  }
  return terms
}

export function requiresLikeSearch(input: string): boolean {
  return REQUIRES_LIKE_SEARCH_PATTERN.test(input)
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
  let pattern = ''
  for (const character of input) {
    pattern += ACCENT_INSENSITIVE_PATTERN_BY_CHARACTER.get(character.toLowerCase()) || character
  }
  return pattern
}

function escapeSearchTermRegexp(input: string): string {
  return input.replace(regexpEscape, '\\$&')
}
