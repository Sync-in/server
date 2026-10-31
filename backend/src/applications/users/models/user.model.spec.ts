import { USER_ROLE } from '../constants/user.js'
import { UserModel } from './user.model.js'

describe(UserModel.name, () => {
  it('normalizes file preferences and preserves explicit values', () => {
    const defaultUser = new UserModel({ id: 1, login: 'alice', role: USER_ROLE.USER })
    const customizedUser = new UserModel({
      id: 2,
      login: 'bob',
      role: USER_ROLE.USER,
      preferences: { showHiddenFiles: false, singleClickNavigation: true }
    })

    expect(defaultUser.preferences.showHiddenFiles).toBe(true)
    expect(defaultUser.preferences.singleClickNavigation).toBe(false)
    expect(customizedUser.preferences.showHiddenFiles).toBe(false)
    expect(customizedUser.preferences.singleClickNavigation).toBe(true)
  })

  it('serializes only public user properties', () => {
    const user = new UserModel(
      {
        id: 1,
        login: 'alice',
        role: USER_ROLE.USER,
        password: 'password-hash',
        externalId: 'external-subject',
        secrets: { twoFaSecret: 'totp-secret', appPasswords: [{ name: 'desktop', password: 'app-password' }] }
      } as any,
      false
    )
    user.exp = 123456

    const serialized = JSON.parse(JSON.stringify(user))

    expect(serialized).not.toHaveProperty('password')
    expect(serialized).not.toHaveProperty('secrets')
    expect(serialized).not.toHaveProperty('externalId')
    expect(serialized).not.toHaveProperty('exp')
    expect(serialized).toEqual(expect.objectContaining({ id: 1, login: 'alice', twoFaEnabled: true, appPasswords: 1 }))
  })

  it('drops private properties when restoring a cached user', () => {
    const user = UserModel.fromSerialized({
      id: 1,
      login: 'alice',
      role: USER_ROLE.USER,
      applications: [],
      twoFaEnabled: false,
      password: 'password-hash',
      secrets: { twoFaSecret: 'totp-secret' },
      externalId: 'external-subject',
      exp: 123456
    })

    expect(user).not.toHaveProperty('password')
    expect(user.secrets).toEqual({ twoFaSecret: false })
    expect(user.externalId).toBeUndefined()
    expect(user.exp).toBeUndefined()
    const serialized = JSON.parse(JSON.stringify(user))
    expect(serialized).not.toHaveProperty('secrets')
    expect(serialized).not.toHaveProperty('externalId')
    expect(serialized).not.toHaveProperty('exp')
  })
})
