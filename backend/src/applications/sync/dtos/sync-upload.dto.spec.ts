import { syncUploadSchema } from './sync-upload.dto.js'

describe('syncUploadSchema', () => {
  it('parses integer query parameters', () => {
    expect(syncUploadSchema.parse({ mtime: '1700000000', size: '42' })).toEqual({ mtime: 1700000000, size: 42 })
  })

  it.each(['', ' ', '1.5', '1e3', '0x10'])('rejects an ambiguous integer query parameter: %j', (value) => {
    expect(syncUploadSchema.safeParse({ mtime: value, size: '42' }).success).toBe(false)
  })

  it('rejects a negative upload size', () => {
    expect(syncUploadSchema.safeParse({ mtime: '1700000000', size: '-1' }).success).toBe(false)
  })

  it('accepts query parameters at the safe integer boundary', () => {
    const boundary = String(Number.MAX_SAFE_INTEGER)
    expect(syncUploadSchema.parse({ mtime: boundary, size: boundary })).toEqual({
      mtime: Number.MAX_SAFE_INTEGER,
      size: Number.MAX_SAFE_INTEGER
    })
  })

  it.each(['9007199254740992', '-9007199254740992'])('rejects an unsafe upload timestamp: %s', (mtime) => {
    expect(syncUploadSchema.safeParse({ mtime, size: '42' }).success).toBe(false)
  })

  it('rejects an unsafe upload size', () => {
    expect(syncUploadSchema.safeParse({ mtime: '1700000000', size: '9007199254740992' }).success).toBe(false)
  })
})
