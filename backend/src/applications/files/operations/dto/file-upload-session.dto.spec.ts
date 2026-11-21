import crypto from 'node:crypto'
import { fileUploadSessionIdSchema } from './file-upload-session.dto.js'

describe('file upload session schemas', () => {
  it('accepts UUID v4 upload identifiers', () => {
    expect(fileUploadSessionIdSchema.parse(crypto.randomUUID())).toBeTypeOf('string')
  })

  it('rejects non-UUID identifiers', () => {
    expect(fileUploadSessionIdSchema.safeParse('../session').success).toBe(false)
  })
})
