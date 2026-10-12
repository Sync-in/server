import { MEMBER_TYPE } from '../../users/constants/member.js'
import { createOrUpdateSpaceSchema } from './create-or-update-space.dto.js'

describe('createOrUpdateSpaceSchema', () => {
  const manager = { id: 1, type: MEMBER_TYPE.USER }
  const largeInteger = 2 ** 53

  it.each([
    { name: 'space', managers: [manager] },
    { name: 'space', managers: [manager], members: null, links: null }
  ])('normalizes missing or null member collections', (input) => {
    expect(createOrUpdateSpaceSchema.parse(input)).toEqual(expect.objectContaining({ members: [], links: [], storageQuota: null }))
  })

  it('normalizes a null alias to an empty string', () => {
    expect(createOrUpdateSpaceSchema.parse({ name: 'space', alias: null, managers: [manager] }).alias).toBe('')
  })

  it('accepts large space, member and link ids and storage quotas', () => {
    const member = { id: largeInteger, type: MEMBER_TYPE.USER, linkId: largeInteger }
    const result = createOrUpdateSpaceSchema.parse({
      id: largeInteger,
      name: 'space',
      storageQuota: largeInteger,
      managers: [member],
      members: [member],
      links: [member]
    })

    expect(result).toMatchObject({
      id: largeInteger,
      storageQuota: largeInteger,
      managers: [member],
      members: [member],
      links: [member]
    })
  })

  it.each(['id', 'storageQuota'])('still rejects a fractional %s', (field) => {
    expect(createOrUpdateSpaceSchema.safeParse({ name: 'space', managers: [manager], [field]: 1.5 }).success).toBe(false)
  })

  it.each(['id', 'linkId'])('still rejects a fractional member %s', (field) => {
    expect(createOrUpdateSpaceSchema.safeParse({ name: 'space', managers: [manager], members: [{ ...manager, [field]: 1.5 }] }).success).toBe(false)
  })

  it('preserves null ids, storage quotas and member link ids', () => {
    const result = createOrUpdateSpaceSchema.parse({
      name: 'space',
      id: null,
      storageQuota: null,
      managers: [{ ...manager, linkId: null }]
    })

    expect(result).toMatchObject({ id: null, storageQuota: null, managers: [{ linkId: null }] })
  })
})
