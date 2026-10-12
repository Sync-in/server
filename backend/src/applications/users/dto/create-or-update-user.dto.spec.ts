import { createUserSchema, updateUserSchema } from './create-or-update-user.dto.js'

describe('user schemas', () => {
  it('normalizes null profile names to empty strings', () => {
    const user = createUserSchema.parse({
      login: 'user',
      email: 'user@example.test',
      password: 'password',
      firstName: null,
      lastName: null
    })

    expect(user).toEqual(expect.objectContaining({ firstName: '', lastName: '' }))
    expect(updateUserSchema.parse({ firstName: null, lastName: null })).toEqual({ firstName: '', lastName: '' })
  })

  it('keeps omitted profile names undefined', () => {
    expect(updateUserSchema.parse({})).toEqual({})
  })

  it('accepts an omitted active state but rejects null', () => {
    const input = {
      login: 'user',
      email: 'user@example.test',
      password: 'password',
      firstName: 'User'
    }

    expect(createUserSchema.parse(input).isActive).toBeUndefined()
    expect(createUserSchema.safeParse({ ...input, isActive: null }).success).toBe(false)
    expect(updateUserSchema.safeParse({ isActive: null }).success).toBe(false)
  })

  it('accepts large integer quotas and member ids without changing their values', () => {
    const largeInteger = 2 ** 53
    const properties = { storageQuota: largeInteger, groups: [largeInteger], managers: [largeInteger] }
    const user = createUserSchema.parse({
      login: 'user',
      email: 'user@example.test',
      password: 'password',
      firstName: 'User',
      ...properties
    })

    expect(user).toEqual(expect.objectContaining(properties))
    expect(updateUserSchema.parse(properties)).toEqual(properties)
  })

  it.each([{ storageQuota: 1.5 }, { groups: [1.5] }, { managers: [1.5] }])('rejects fractional quotas and member ids: %j', (properties) => {
    expect(updateUserSchema.safeParse(properties).success).toBe(false)
  })

  it('preserves null and omitted quotas and member lists', () => {
    const properties = { storageQuota: null, groups: null, managers: null }

    expect(updateUserSchema.parse(properties)).toEqual(properties)
    expect(updateUserSchema.parse({})).toEqual({})
  })
})
