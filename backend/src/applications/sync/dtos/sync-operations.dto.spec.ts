import { Logger } from '@nestjs/common'
import { syncDiffSchema } from './sync-operations.dto.js'

const diff = { secureDiff: false, firstSync: true, defaultFilters: [] }

describe('Sync diff path filters', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
  })
  afterEach(() => vi.restoreAllMocks())

  it('accepts the historical string source and keeps supported alternatives', () => {
    const parsed = syncDiffSchema.parse({ ...diff, pathFilters: '(?:cache|tmp)/|(?=documents)' })

    expect(parsed.pathFilters?.test('cache/file.txt')).toBe(true)
    expect(parsed.pathFilters?.test('tmp/file.txt')).toBe(true)
    expect(parsed.pathFilters?.test('documents/file.txt')).toBe(false)
    expect(Logger.prototype.warn).toHaveBeenCalledOnce()
  })

  it.each([{}, { pathFilters: null }, { pathFilters: '' }])('accepts missing or empty custom exclusions: %j', (filters) => {
    expect(syncDiffSchema.parse({ ...diff, ...filters }).pathFilters).toBeNull()
    expect(Logger.prototype.warn).not.toHaveBeenCalled()
  })

  it.each([{ pathFilters: [] }, { pathFilters: ['\\.tmp$'] }, { pathFilters: [1] }, { pathFilters: 42 }, { pathFilters: {} }])(
    'rejects a non-string HTTP path filter source: $pathFilters',
    ({ pathFilters }) => {
      expect(syncDiffSchema.safeParse({ ...diff, pathFilters }).success).toBe(false)
    }
  )
})
