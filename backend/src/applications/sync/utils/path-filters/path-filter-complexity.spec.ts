import { RegExpParser } from '@eslint-community/regexpp'
import { getPathFilterAlternativeComplexity, parsePathFilterAlternatives } from './path-filter-complexity.js'

afterEach(() => vi.restoreAllMocks())

describe(getPathFilterAlternativeComplexity.name, () => {
  it('reuses the parsed alternatives to collect costs and capture names', () => {
    const parse = vi.spyOn(RegExpParser.prototype, 'parsePattern')
    const alternatives = parsePathFilterAlternatives('[A-Z]{0}|(?<entry>[a-z]){0}')

    expect(alternatives.map((alternative) => alternative.raw)).toEqual(['[A-Z]{0}', '(?<entry>[a-z]){0}'])
    expect(alternatives.map((alternative) => getPathFilterAlternativeComplexity(alternative, 3, 26))).toEqual([
      { programSize: 3, parseCost: 26, captureNames: [] },
      { programSize: 3, parseCost: 26, captureNames: ['entry'] }
    ])
    expect(parse).toHaveBeenCalledOnce()
  })

  it.each([
    { pattern: '[A-Z]', programLimit: 3, parseLimit: 26, programSize: 3 },
    { pattern: '[A-Z]', programLimit: 2, parseLimit: 26, programSize: 3 },
    { pattern: '[A-Z]', programLimit: 3, parseLimit: 25, programSize: 4 },
    { pattern: '(?:a{1000}[A-Z]){0}', programLimit: 3, parseLimit: 26, programSize: 3 }
  ])('bounds program and parsing costs for $pattern', ({ pattern, programLimit, parseLimit, programSize }) => {
    const [alternative] = parsePathFilterAlternatives(pattern)

    expect(getPathFilterAlternativeComplexity(alternative, programLimit, parseLimit)).toEqual({
      programSize,
      parseCost: 26,
      captureNames: []
    })
  })

  it.each(['\\w', '[\\w]'])('charges shorthand classes inside and outside brackets: %s', (pattern) => {
    const [alternative] = parsePathFilterAlternatives(pattern)

    expect(getPathFilterAlternativeComplexity(alternative, 3, 128)).toEqual({ programSize: 3, parseCost: 128, captureNames: [] })
    expect(getPathFilterAlternativeComplexity(alternative, 3, 127).programSize).toBe(4)
  })
})
