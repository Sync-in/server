import { escapeString } from '../../../common/functions'
import { minCharsToSearch } from '../constants/indexing'

const regexMatchSearchBoolean = new RegExp(`([+-]?)(?:"([^"]+)"|(\\S+))`)
const regexMatchesSearchBoolean = new RegExp(regexMatchSearchBoolean.source, 'g')
const booleanOperators = new Set(['+', '-', '<', '>', '~', '*'])
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
    if (item[0] < this.data[this.data.length - 1][0] || (this.data.length === this.nbItems && this.data.find(([num]) => num === item[0]))) {
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

export function analyzeTerms(search: string, onlyAllowNegative = false): string[] {
  /* Get the positive or negative terms list */
  const matches: RegExpMatchArray | [] = search.match(regexMatchesSearchBoolean) || []
  if (!matches.length) {
    return matches
  }
  return matches
    .flatMap((match: string) => {
      const [, operator, quoted, unquoted] = match.match(regexMatchSearchBoolean)
      let term: string = (quoted || unquoted).trim()

      if (term.length < minCharsToSearch) return null

      if ((onlyAllowNegative && operator !== '-') || (!onlyAllowNegative && (operator === '-' || operator === '~'))) return null

      if (booleanOperators.has(term[0])) {
        term = term.substring(1)
      }

      if (term[term.length - 1] === '*') {
        term = term.substring(0, term.length - 1)
      }

      return escapeString(term)
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
    .map((t) => `(?=.*\\b${t})`)
    .join('')
  if (!negativeTerms.length) return new RegExp(p, 'i')
  const n = negativeTerms
    .map((t) => genAccentInsensitiveRegexpPattern(t))
    .map((t) => `\\b${t}\\b`)
    .join('|')
  return new RegExp(`^${p}(?!.*(${n})).*$`, 'i')
}

function genAccentInsensitiveRegexpPattern(input: string): string {
  /* Allow to catch all terms with accents or not */
  return input
    .split('')
    .map((char: string) => accentToBaseMap.get(char) || char)
    .join('')
}
