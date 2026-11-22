import { FilesConfigSchema } from './files.config.js'

describe('FilesConfigSchema', () => {
  const paths = { dataPath: '/data', usersPath: '/data/users', spacesPath: '/data/spaces', linksPath: '/data/links' }

  it('accepts a large upload ceiling without changing its value', () => {
    const maxUploadSize = 2 ** 53

    expect(FilesConfigSchema.parse({ ...paths, transfers: { maxUploadSize } }).transfers.maxUploadSize).toBe(maxUploadSize)
  })

  it('accepts text sizes', () => {
    const config = FilesConfigSchema.parse({ ...paths, transfers: { maxUploadSize: '5 GB', maxChunkSize: '95 MB' } })

    expect(config.transfers).toEqual({ maxUploadSize: 5_368_709_120, maxChunkSize: 99_614_720 })
  })

  it.each([1.5, Infinity, -Infinity])('rejects a fractional or non-finite upload ceiling: %s', (maxUploadSize) => {
    expect(FilesConfigSchema.safeParse({ ...paths, transfers: { maxUploadSize } }).success).toBe(false)
  })

  it('defaults maxChunkSize to 95 MB when omitted', () => {
    expect(FilesConfigSchema.parse(paths).transfers.maxChunkSize).toBe(99_614_720)
  })

  it.each([null, 0, '0 B'])('advertises client chunking as disabled when maxChunkSize is %s', (maxChunkSize) => {
    expect(FilesConfigSchema.parse({ ...paths, transfers: { maxChunkSize } }).transfers.maxChunkSize).toBeNull()
  })

  it('accepts the minimum chunk size independently of the upload ceiling', () => {
    const maxChunkSize = 1_000_000
    const config = FilesConfigSchema.parse({ ...paths, transfers: { maxUploadSize: 1, maxChunkSize } })

    expect(config.transfers.maxChunkSize).toBe(maxChunkSize)
  })

  it.each([999_999, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects an invalid chunk size: %s', (maxChunkSize) => {
    expect(FilesConfigSchema.safeParse({ ...paths, transfers: { maxChunkSize } }).success).toBe(false)
  })

  it('rejects an invalid text size', () => {
    const maxChunkSize = '1.5 MB'
    expect(FilesConfigSchema.safeParse({ ...paths, transfers: { maxChunkSize } }).success).toBe(false)
  })
})
