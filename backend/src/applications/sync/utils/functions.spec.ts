import { BadRequestException, Logger } from '@nestjs/common'
import { RE2JS } from 're2js'
import { transformPathFilters } from './functions.js'
import { SYNC_MAX_PATH_FILTER_PATTERN_LENGTH, SYNC_MAX_PATH_FILTER_WARNINGS } from './path-filters/constants.js'

describe(transformPathFilters.name, () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
  })
  afterEach(() => vi.restoreAllMocks())

  it('returns null for empty or non-string values', () => {
    for (const value of [null, undefined, '', [], {}, 0]) {
      expect(transformPathFilters(value)).toBeNull()
    }
    expect(Logger.prototype.warn).not.toHaveBeenCalled()
  })

  it('returns a case-insensitive RE2JS matcher with unanchored search semantics', () => {
    const pathFilter = transformPathFilters('documents/.+\\.pdf$')

    expect(pathFilter).toBeInstanceOf(RE2JS)
    expect(pathFilter?.test('archive/DOCUMENTS/report.PDF')).toBe(true)
  })

  it('keeps supported alternatives and logs rejected ones', () => {
    const pathFilter = transformPathFilters('\\.tmp$|(?=documents)')

    expect(pathFilter?.test('documents/report.TMP')).toBe(true)
    expect(pathFilter?.test('documents/report.txt')).toBe(false)
    expect(Logger.prototype.warn).toHaveBeenCalledOnce()
    expect(vi.mocked(Logger.prototype.warn).mock.calls[0][0]).toMatchObject({
      index: 1,
      pattern: '(?=documents)',
      reason: 'Invalid or unsupported path filter pattern'
    })
  })

  it('maps an oversized source to a bad request', () => {
    const transform = () => transformPathFilters('a'.repeat(SYNC_MAX_PATH_FILTER_PATTERN_LENGTH + 1))

    expect(transform).toThrow(BadRequestException)
    expect(Logger.prototype.warn).not.toHaveBeenCalled()
  })

  it('caps rejection details and summarizes the remaining ignored alternatives', () => {
    const source = Array(SYNC_MAX_PATH_FILTER_WARNINGS + 2)
      .fill('(?=x)')
      .join('|')

    expect(transformPathFilters(source)).toBeNull()
    expect(Logger.prototype.warn).toHaveBeenCalledTimes(SYNC_MAX_PATH_FILTER_WARNINGS + 1)
    expect(vi.mocked(Logger.prototype.warn).mock.calls[SYNC_MAX_PATH_FILTER_WARNINGS][0]).toMatchObject({
      msg: 'Additional path filter alternatives ignored',
      count: 2
    })
  })

  it('propagates unexpected compilation errors', () => {
    const failure = new Error('Unexpected compilation failure')
    vi.spyOn(RE2JS, 'compile').mockImplementation(() => {
      throw failure
    })

    let thrown: unknown
    try {
      transformPathFilters('\\.tmp$')
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBe(failure)
    expect(Logger.prototype.warn).not.toHaveBeenCalled()
  })
})
