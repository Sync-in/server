import { spaceRootFileSchema, spaceRootSchema } from './space-roots.dto.js'

describe('spaceRootSchema', () => {
  const largeInteger = 2 ** 53
  const root = { id: 0, alias: 'docs', name: 'Docs', permissions: '' }

  it.each(['../../foo/bar', 'files/personal/../../../foo/bar'])('normalizes the path %s with the zero file marker', (path) => {
    expect(spaceRootFileSchema.parse({ id: 0, path })).toEqual({ id: 0, path: 'foo/bar' })
  })

  it.each([0, -largeInteger, largeInteger])('accepts the integer file id %s without a safe-integer limit', (id) => {
    expect(spaceRootFileSchema.parse({ id, path: 'folder' })).toEqual({ id, path: 'folder' })
  })

  it('accepts a large negative inode as both the new root id and file reference', () => {
    const input = {
      ...root,
      id: -largeInteger,
      file: { id: -largeInteger, path: 'files/personal/folder//file.txt' }
    }

    expect(spaceRootSchema.parse(input)).toMatchObject({
      id: -largeInteger,
      file: { id: -largeInteger, path: 'folder/file.txt' }
    })
  })

  it('accepts large persisted root, owner and file ids', () => {
    const input = { ...root, id: largeInteger, owner: { id: largeInteger, login: 'owner' }, file: { id: largeInteger, path: 'folder' } }

    expect(spaceRootSchema.parse(input)).toEqual(input)
  })

  it.each([1.5, -1.5, Infinity, -Infinity])('rejects an invalid file reference %s when file validation applies', (id) => {
    const result = spaceRootSchema.safeParse({ ...root, file: { id, path: 'folder' } })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: ['file', 'id'] })]))
    }
  })

  it('still rejects a fractional root id', () => {
    expect(spaceRootSchema.safeParse({ ...root, id: 1.5 }).success).toBe(false)
  })

  it('still rejects a fractional owner id', () => {
    expect(spaceRootSchema.safeParse({ ...root, owner: { id: 1.5, login: 'owner' } }).success).toBe(false)
  })

  it.each([undefined, null, { id: null, path: null }, { id: 0, path: null }])('preserves conditional validation for hidden files', (file) => {
    expect(spaceRootSchema.safeParse({ ...root, owner: null, file }).success).toBe(true)
  })

  it('preserves skipped file validation for external roots', () => {
    expect(spaceRootSchema.safeParse({ ...root, externalPath: '/external', file: { id: largeInteger, path: null } }).success).toBe(true)
  })
})
