import { FilesConfigSchema } from './files.config.js'

describe('FilesConfigSchema', () => {
  const paths = { dataPath: '/data', usersPath: '/data/users', spacesPath: '/data/spaces', linksPath: '/data/links' }

  it('accepts a large upload ceiling without changing its value', () => {
    const maxUploadSize = 2 ** 53

    expect(FilesConfigSchema.parse({ ...paths, maxUploadSize }).maxUploadSize).toBe(maxUploadSize)
  })

  it.each([1.5, Infinity, -Infinity])('rejects a fractional or non-finite upload ceiling: %s', (maxUploadSize) => {
    expect(FilesConfigSchema.safeParse({ ...paths, maxUploadSize }).success).toBe(false)
  })
})
