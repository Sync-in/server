import { regexpEscape } from '../../../common/functions'
import { MIN_CHARS_TO_SEARCH } from '../constants/indexing'

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
  value: string
  operator: 'required' | 'excluded' | 'optional'
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
  /* Get the positive or negative terms list */
  const matches: RegExpMatchArray | [] = search.match(regexMatchesSearchBoolean) || []
  if (!matches.length) {
    return matches
  }
  return matches
    .flatMap((match: string) => {
      const [, operator, quoted, unquoted] = match.match(regexMatchSearchBoolean)
      let term: string = (quoted || unquoted).trim()

      if (term.length < MIN_CHARS_TO_SEARCH) return null

      if ((onlyAllowNegative && operator !== '-') || (!onlyAllowNegative && (operator === '-' || operator === '~'))) return null

      if (booleanOperators.has(term[0])) {
        term = term.substring(1)
      }

      if (term[term.length - 1] === '*') {
        term = term.substring(0, term.length - 1)
      }

      return escapeForRegexp ? escapeSearchTermRegexp(term) : term
    })
    .filter(Boolean)
}

export function genTermsPattern(terms: string[]): string {
  return terms.map((t) => genAccentInsensitiveRegexpPattern(t)).join('|')
}

export function genRegexPositiveAndNegativeTerms(search: string): RegExp {
  const positiveTerms = analyzeTerms(search)
  const negativeTerms = analyzeTerms(search, true)
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
    let value = (quoted || unquoted).trim()
    while (booleanOperators.has(value[0])) {
      value = value.substring(1)
    }
    if (value[value.length - 1] === '*') {
      value = value.substring(0, value.length - 1)
    }
    if (value.length < MIN_CHARS_TO_SEARCH) {
      return []
    }
    const searchOperator: SearchTerm['operator'] = operator === '+' ? 'required' : operator === '-' ? 'excluded' : 'optional'
    return [
      {
        value,
        operator: searchOperator
      }
    ]
  })
}

export function likeSearchTermStartPattern(): string {
  return `(?=${LIKE_SEARCH_CHAR})`
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
