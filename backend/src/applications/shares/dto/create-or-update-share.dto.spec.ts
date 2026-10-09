import { MEMBER_TYPE } from '../../users/constants/member.js'
import { createOrUpdateShareSchema } from './create-or-update-share.dto.js'

describe('createOrUpdateShareSchema', () => {
  const largeInteger = 2 ** 53

  it.each([{ name: 'share' }, { name: 'share', members: null, links: null }])('normalizes missing or null member collections', (input) => {
    expect(createOrUpdateShareSchema.parse(input)).toEqual(expect.objectContaining({ members: [], links: [], storageQuota: null }))
  })

  it('normalizes a null alias to an empty string', () => {
    expect(createOrUpdateShareSchema.parse({ name: 'share', alias: null }).alias).toBe('')
  })

  it('accepts a child share without a file owner id', () => {
    const file = { id: 42, path: 'folder' }
    const input = { name: 'child', parent: { alias: 'parent' }, file }

    expect(createOrUpdateShareSchema.parse(input).file).toEqual(file)
  })

  it('accepts an external space root when updating a share', () => {
    const file = {
      id: null,
      ownerId: null,
      path: '.',
      space: { alias: 'team', name: 'Team', root: { alias: 'external-root', name: 'External root' } }
    }

    expect(createOrUpdateShareSchema.parse({ id: 843, name: 'renamed share', externalPath: null, file }).file).toEqual(file)
  })

  it.each([null, 42])('normalizes file properties before conditional validation for id %s', (id) => {
    const file = {
      id,
      ownerId: null,
      path: 'folder//file.txt',
      space: { alias: ' team ', name: null, root: { alias: ' external/root.. ', name: null } }
    }

    expect(createOrUpdateShareSchema.parse({ name: 'share', file }).file).toEqual({
      id,
      ownerId: null,
      path: 'folder/file.txt',
      space: { alias: 'team', name: '', root: { alias: 'externalroot', name: '' } }
    })
    expect(file.space.alias).toBe(' team ')
    expect(file.path).toBe('folder//file.txt')
  })

  it('preserves omitted names and extra file properties when validation is skipped', () => {
    const file = { id: null, ownerId: null, path: '.', mime: 'inode/directory', space: { root: {} } }

    expect(createOrUpdateShareSchema.parse({ name: 'share', file }).file).toEqual(file)
  })

  it('still validates files with an id', () => {
    const input = { name: 'share', file: { id: 42, ownerId: null, path: '.' } }

    expect(createOrUpdateShareSchema.safeParse(input).success).toBe(true)
    const result = createOrUpdateShareSchema.safeParse({ ...input, file: { ...input.file, path: null } })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: ['file', 'path'] })]))
    }
  })

  it('rejects a path emptied by normalization for a file with an id', () => {
    expect(createOrUpdateShareSchema.safeParse({ name: 'share', file: { id: 42, ownerId: null, path: '../' } }).success).toBe(false)
  })

  it('accepts large share, member and link ids and storage quotas', () => {
    const member = { id: largeInteger, type: MEMBER_TYPE.USER, linkId: largeInteger }
    const result = createOrUpdateShareSchema.parse({
      id: largeInteger,
      name: 'share',
      storageQuota: largeInteger,
      members: [member],
      links: [member]
    })

    expect(result).toMatchObject({ id: largeInteger, storageQuota: largeInteger, members: [member], links: [member] })
  })

  it('accepts a large negative inode as a file reference', () => {
    const file = { id: -largeInteger, ownerId: null, path: 'folder//file.txt' }

    expect(createOrUpdateShareSchema.parse({ name: 'share', file }).file).toEqual({ ...file, path: 'folder/file.txt' })
  })

  it('accepts a large persisted file id when updating a share', () => {
    const file = { id: largeInteger, ownerId: null, path: 'folder//file.txt' }

    expect(createOrUpdateShareSchema.parse({ id: 42, name: 'renamed share', file }).file).toEqual({ ...file, path: 'folder/file.txt' })
  })

  it.each([1.5, -1.5, Infinity, -Infinity])('rejects an invalid file reference %s when file validation applies', (id) => {
    const result = createOrUpdateShareSchema.safeParse({ name: 'share', file: { id, ownerId: null, path: 'folder' } })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: ['file', 'id'] })]))
    }
  })

  it.each(['id', 'storageQuota'])('still rejects a fractional %s', (field) => {
    expect(createOrUpdateShareSchema.safeParse({ name: 'share', [field]: 1.5 }).success).toBe(false)
  })

  it.each(['id', 'linkId'])('still rejects a fractional member %s', (field) => {
    expect(createOrUpdateShareSchema.safeParse({ name: 'share', members: [{ id: 1, type: MEMBER_TYPE.USER, [field]: 1.5 }] }).success).toBe(false)
  })

  it('preserves null ids, storage quotas and member link ids', () => {
    const result = createOrUpdateShareSchema.parse({
      name: 'share',
      id: null,
      storageQuota: null,
      members: [{ id: 1, type: MEMBER_TYPE.USER, linkId: null }]
    })

    expect(result).toMatchObject({ id: null, storageQuota: null, members: [{ linkId: null }] })
  })
})
