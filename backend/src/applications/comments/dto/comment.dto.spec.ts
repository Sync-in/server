import { createOrUpdateCommentSchema, deleteCommentSchema } from './comment.dto.js'

describe('comment schemas', () => {
  it('accepts a large temporary inode for the first comment', () => {
    const fileId = -(2 ** 54)

    expect(createOrUpdateCommentSchema.parse({ fileId, content: 'Comment' })).toEqual({ fileId, content: 'Comment' })
  })

  it('preserves large SQL file and comment identifiers for updates and deletions', () => {
    const fileId = 2 ** 54
    const commentId = 2 ** 53

    expect(createOrUpdateCommentSchema.parse({ fileId, content: 'Updated', commentId })).toEqual({ fileId, content: 'Updated', commentId })
    expect(deleteCommentSchema.parse({ fileId, commentId })).toEqual({ fileId, commentId })
  })

  it.each([1.5, -1.5, NaN, Infinity, -Infinity])('rejects a non-integer or non-finite file identifier %s', (fileId) => {
    expect(createOrUpdateCommentSchema.safeParse({ fileId, content: 'Comment' }).success).toBe(false)
    expect(deleteCommentSchema.safeParse({ fileId, commentId: 42 }).success).toBe(false)
  })
})
