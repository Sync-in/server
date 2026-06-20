import { BadRequestException } from '@nestjs/common'
import { SYNC_MAX_PATH_FILTER_PATTERN_LENGTH } from '../constants/sync'
import { transformPathFilters } from './functions'

describe(transformPathFilters.name, () => {
  it('returns null for empty or non-string values', () => {
    expect(transformPathFilters(null)).toBeNull()
    expect(transformPathFilters('')).toBeNull()
  })

  it('returns a case-insensitive regular expression for safe patterns', () => {
    const pathFilter = transformPathFilters('documents/.+\\.pdf$')

    expect(pathFilter).toBeInstanceOf(RegExp)
    expect(pathFilter?.flags).toContain('i')
    expect(pathFilter?.test('DOCUMENTS/report.PDF')).toBe(true)
  })

  it('rejects path filter patterns that are too long', () => {
    const transform = () => transformPathFilters('a'.repeat(SYNC_MAX_PATH_FILTER_PATTERN_LENGTH + 1))

    expect(transform).toThrow(BadRequestException)
    expect(transform).toThrow('Path filter pattern is too long')
  })

  it('rejects invalid regular expressions with an explicit invalid-pattern error', () => {
    const transform = () => transformPathFilters('(')

    expect(transform).toThrow(BadRequestException)
    expect(transform).toThrow('Invalid path filter pattern')
  })

  it('rejects unsafe regular expressions with an explicit unsafe-pattern error', () => {
    const transform = () => transformPathFilters('^(a+)+b')

    expect(transform).toThrow(BadRequestException)
    expect(transform).toThrow('Unsafe path filter pattern')
  })
})
