import { downloadFileSchema } from './file-operations.dto.js'

describe('downloadFileSchema', () => {
  it.each(['https://files.example.test/archive.zip', 'http://203.0.113.1/archive.zip'])('accepts an HTTP(S) URL: %s', (url) => {
    expect(downloadFileSchema.parse({ url })).toEqual({ url })
  })

  it.each(['ftp://files.example.test/archive.zip', 'https://files_server.example.test/archive.zip', 'https://files.example.test./archive.zip'])(
    'rejects a URL outside the former IsUrl contract: %s',
    (url) => {
      expect(downloadFileSchema.safeParse({ url }).success).toBe(false)
    }
  )
})
