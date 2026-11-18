import { deleteFileFavoriteSchema, fileFavoriteSchema } from './file-favorite.dto.js'

describe('file favorite schemas', () => {
  it('accepts a large temporary inode when adding a favorite', () => {
    const fileId = -(2 ** 54)

    expect(fileFavoriteSchema.parse({ fileId })).toEqual({ fileId })
  })

  it.each([0, 2 ** 53, -1.5, Infinity, -Infinity])('rejects an invalid file reference: %s', (fileId) => {
    expect(fileFavoriteSchema.safeParse({ fileId }).success).toBe(false)
  })

  it.each([1, 42, 2 ** 53, 2 ** 54])('accepts the positive SQL identifier %s for favorite deletion', (fileId) => {
    expect(deleteFileFavoriteSchema.parse({ fileId })).toEqual({ fileId })
  })

  it.each([0, -(2 ** 54), 1.5, NaN, Infinity, -Infinity])('rejects an invalid identifier %s for favorite deletion', (fileId) => {
    expect(deleteFileFavoriteSchema.safeParse({ fileId }).success).toBe(false)
  })
})
