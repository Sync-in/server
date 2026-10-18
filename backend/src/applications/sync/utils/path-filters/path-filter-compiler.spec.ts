import { RegExpParser } from '@eslint-community/regexpp'
import { RE2JS } from 're2js'
import { SYNC_MAX_PATH_FILTER_LENGTH, SYNC_MAX_PATH_FILTER_PATTERN_LENGTH, SYNC_MAX_PATH_FILTERS } from './constants.js'
import { PathFilterError } from './errors.js'
import { buildPathFilterSource, compilePathFilters, validatePathFilterList } from './path-filter-compiler.js'

afterEach(() => vi.restoreAllMocks())

describe(buildPathFilterSource.name, () => {
  it.each([
    { filters: [], source: null },
    { filters: [''], source: '(?:)' },
    { filters: ['', 'a'], source: '|a' },
    { filters: [' documents/.+\\.pdf$ ', '^資料/報告$', 'a|b'], source: ' documents/.+\\.pdf$ |^資料/報告$|a|b' }
  ])('preserves the filter source for $filters', ({ filters, source }) => {
    expect(buildPathFilterSource(filters)).toBe(source)
  })

  it('validates the list shape and entry count', () => {
    for (const filters of [null, 'a', [null], Array(1)]) {
      expect(() => buildPathFilterSource(filters as unknown as readonly string[])).toThrow('Invalid path filters')
    }
    expect(() => buildPathFilterSource(Array(SYNC_MAX_PATH_FILTERS + 1).fill('a'))).toThrow('Too many path filters')
  })

  it('enforces only the combined length so oversized entries can be ignored later', () => {
    const maxFilters = Array(SYNC_MAX_PATH_FILTERS).fill('a'.repeat(SYNC_MAX_PATH_FILTER_LENGTH))
    const oversizedEntry = 'a'.repeat(SYNC_MAX_PATH_FILTER_LENGTH + 1)

    expect(buildPathFilterSource(maxFilters)).toHaveLength(SYNC_MAX_PATH_FILTER_PATTERN_LENGTH)
    expect(buildPathFilterSource([oversizedEntry])).toBe(oversizedEntry)
    expect(() => buildPathFilterSource(['a'.repeat(SYNC_MAX_PATH_FILTER_PATTERN_LENGTH), 'b'])).toThrow(
      new PathFilterError('Path filter pattern is too long')
    )
  })
})

describe(validatePathFilterList.name, () => {
  it('maps rejected alternatives to their original filters', () => {
    expect(validatePathFilterList(['^documents/', 'a{00}|^photos/', '\\Qfile\\E'])).toEqual([1, 2])
  })

  it('marks every filter when the combined syntax cannot be parsed', () => {
    expect(validatePathFilterList(['^documents/', '(', '^photos/'])).toEqual([0, 1, 2])
  })
})

describe(compilePathFilters.name, () => {
  it('uses a case-insensitive RE2JS matcher with unanchored search semantics', () => {
    const result = compilePathFilters('documents/.+\\.pdf$')
    const adversarial = compilePathFilters('(a|a)*$').matcher

    expect(result).toMatchObject({ rejected: [], matcher: expect.any(RE2JS) })
    expect(result.matcher?.test('archive/DOCUMENTS/report.PDF')).toBe(true)
    expect(adversarial).toBeInstanceOf(RE2JS)
    expect(adversarial?.test(`${'a'.repeat(28)}/`)).toBe(true)
  })

  it('distinguishes absent filters from universal empty alternatives', () => {
    expect(compilePathFilters(null)).toEqual({ matcher: null, rejected: [] })
    expect(compilePathFilters('')).toEqual({ matcher: null, rejected: [] })
    expect(compilePathFilters(buildPathFilterSource([''])).matcher?.test('documents/report.txt')).toBe(true)
    expect(compilePathFilters('|^documents/').matcher?.test('archive/report.txt')).toBe(true)
  })

  it('parses once, preserves structural pipes and keeps supported alternatives in order', () => {
    const parse = vi.spyOn(RegExpParser.prototype, 'parsePattern')
    const compileRE2 = vi.spyOn(RE2JS, 'compile')
    const source = '^(?:foo|bar)$|^literal\\|pipe$|^[a|b]$|(?=ignored)|^資料/'
    const accepted = '^(?:foo|bar)$|^literal\\|pipe$|^[a|b]$|^資料/'
    const result = compilePathFilters(source)

    expect(parse).toHaveBeenCalledOnce()
    expect(result.rejected).toEqual([{ index: 3, pattern: '(?=ignored)', reason: 'Invalid or unsupported path filter pattern' }])
    expect(compileRE2).toHaveBeenLastCalledWith(accepted, expect.any(Number))
    for (const path of ['foo', 'bar', 'literal|pipe', '|', '資料/report.pdf']) {
      expect(result.matcher?.test(path)).toBe(true)
    }
    expect(result.matcher?.test('literal')).toBe(false)
  })

  it.each(['a{00}', '\\Qfile\\E', '[]', '[[:alpha:]]', '[\\a-z]', '[B-😀]'])(
    'rejects regexpp/RE2JS dialect divergences before compilation: %s',
    (pattern) => {
      const compileRE2 = vi.spyOn(RE2JS, 'compile')

      expect(compilePathFilters(pattern)).toEqual({
        matcher: null,
        rejected: [{ index: 0, pattern, reason: 'Invalid or unsupported path filter pattern' }]
      })
      expect(compileRE2).not.toHaveBeenCalled()
    }
  )

  it('ignores an oversized alternative while accepting the inclusive entry limit', () => {
    const atLimit = 'a'.repeat(SYNC_MAX_PATH_FILTER_LENGTH)
    const tooLong = `${atLimit}a`
    const result = compilePathFilters(`${atLimit}|${tooLong}|^documents/`)

    expect(result.rejected).toEqual([{ index: 1, pattern: tooLong, reason: 'Path filter pattern is too long' }])
    expect(result.matcher?.test('documents/report.txt')).toBe(true)
  })

  it('rejects an oversized source before parsing or compiling', () => {
    const parse = vi.spyOn(RegExpParser.prototype, 'parsePattern')
    const compileRE2 = vi.spyOn(RE2JS, 'compile')
    const compile = () => compilePathFilters('a'.repeat(SYNC_MAX_PATH_FILTER_PATTERN_LENGTH + 1))

    expect(compile).toThrow('Path filter pattern is too long')
    expect(parse).not.toHaveBeenCalled()
    expect(compileRE2).not.toHaveBeenCalled()
  })

  it('allows more root alternatives than original filter entries', () => {
    const source = Array<string>(SYNC_MAX_PATH_FILTERS + 1)
      .fill('a')
      .join('|')

    expect(compilePathFilters(source)).toMatchObject({ rejected: [], matcher: expect.any(RE2JS) })
  })

  it('rejects a globally malformed source without recovering individual alternatives', () => {
    const source = '^documents/|('
    const compileRE2 = vi.spyOn(RE2JS, 'compile')

    expect(compilePathFilters(source)).toEqual({
      matcher: null,
      rejected: [{ index: 0, pattern: source, reason: 'Invalid or unsupported path filter pattern' }]
    })
    expect(compileRE2).not.toHaveBeenCalled()
  })

  it('turns parser stack exhaustion into a complexity rejection', () => {
    const source = '^documents/|(?:nested)'
    vi.spyOn(RegExpParser.prototype, 'parsePattern').mockImplementation(() => {
      throw new RangeError('Maximum call stack size exceeded')
    })

    expect(compilePathFilters(source)).toEqual({
      matcher: null,
      rejected: [{ index: 0, pattern: source, reason: 'Path filter pattern is too complex' }]
    })
  })

  it.each([
    {
      budget: 'program',
      unsupported: `${'a{1000}'.repeat(16)}(?=x)`,
      tooExpensive: 'a{380}',
      fallback: 'c'
    },
    {
      budget: 'parsing',
      unsupported: `${'[B-翿]'.repeat(3)}(?=x)`,
      tooExpensive: '[A-ࠀ]',
      fallback: '[a-z]'
    }
  ])('does not refund the $budget budget after a failed compilation', ({ unsupported, tooExpensive, fallback }) => {
    const compileRE2 = vi.spyOn(RE2JS, 'compile')
    const result = compilePathFilters(`${unsupported}|${tooExpensive}|${fallback}`)

    expect(result.rejected).toEqual([
      { index: 0, pattern: unsupported, reason: 'Invalid or unsupported path filter pattern' },
      { index: 1, pattern: tooExpensive, reason: 'Path filter pattern is too complex' }
    ])
    expect(compileRE2.mock.calls.map(([source]) => source)).toEqual([unsupported, fallback])
  })

  it('reserves capture names inside zero-repeat groups', () => {
    const result = compilePathFilters('(?<item>a){0}|(?<item>b)|(?<other>c)')

    expect(result.rejected).toEqual([{ index: 1, pattern: '(?<item>b)', reason: 'Invalid or unsupported path filter pattern' }])
    expect(result.matcher?.test('c')).toBe(true)
  })

  it.each(['parser', 'RE2JS'] as const)('propagates unexpected %s errors unchanged', (stage) => {
    const failure = stage === 'parser' ? new Error('Unexpected parser failure') : new RangeError('Unexpected RE2JS stack failure')
    if (stage === 'parser') {
      vi.spyOn(RegExpParser.prototype, 'parsePattern').mockImplementation(() => {
        throw failure
      })
    } else {
      vi.spyOn(RE2JS, 'compile').mockImplementation(() => {
        throw failure
      })
    }

    let thrown: unknown
    try {
      compilePathFilters('a')
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBe(failure)
  })
})
