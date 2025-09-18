/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Test, TestingModule } from '@nestjs/testing'
import bcrypt from 'bcryptjs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { AuthManager } from '../../../authentication/services/auth-manager.service'
import { comparePassword } from '../../../common/functions'
import * as imageModule from '../../../common/image'
import { pngMimeType, svgMimeType } from '../../../common/image'
import { Cache } from '../../../infrastructure/cache/services/cache.service'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants'
import * as filesUtilsModule from '../../files/utils/files'
import { fileName, isPathExists } from '../../files/utils/files'
import { NotificationsManager } from '../../notifications/services/notifications-manager.service'
import { MEMBER_TYPE } from '../constants/member'
import { USER_GROUP_ROLE, USER_MAX_PASSWORD_ATTEMPTS, USER_ROLE } from '../constants/user'
import { CreateUserDto } from '../dto/create-or-update-user.dto'
import { DeleteUserDto } from '../dto/delete-user.dto'
import { UserModel } from '../models/user.model'
import { generateUserTest } from '../utils/test'
import { AdminUsersManager } from './admin-users-manager.service'
import { AdminUsersQueries } from './admin-users-queries.service'
import { UsersManager } from './users-manager.service'
import { UsersQueries } from './users-queries.service'

jest.mock('../../../common/functions', () => {
  const actual = jest.requireActual('../../../common/functions')
  return { ...actual, comparePassword: jest.fn() }
})
jest.mock('bcryptjs', () => ({ __esModule: true, default: { hash: jest.fn(() => Promise.resolve('hashed-password')) } }))
jest.mock('../../../common/image', () => {
  const actual = jest.requireActual('../../../common/image')
  return {
    ...actual,
    generateAvatar: jest.fn(() => Readable.from([Buffer.from('PNGDATA')]))
  }
})

describe(UsersManager.name, () => {
  let usersManager: UsersManager
  let adminUsersManager: AdminUsersManager
  let adminUsersQueries: AdminUsersQueries
  let usersQueriesService: UsersQueries
  let userTest: UserModel
  let deleteUserDto: DeleteUserDto
  const flush = () => new Promise<void>((r) => setImmediate(r))
  const okStream = (d = 'OK') => {
    const s: any = Readable.from([Buffer.from(d)])
    s.truncated = false
    return s
  }
  const errStream = (msg = 'err', truncated = false) => {
    const s: any = new Readable({
      read() {
        this.destroy(new Error(msg))
      }
    })
    s.truncated = truncated
    return s
  }
  const mkReq = (mimetype: string, stream: any, user = userTest) => ({ user, file: jest.fn().mockResolvedValue({ mimetype, file: stream }) })
  const ensurePaths = async () => {
    if (!(await isPathExists(userTest.homePath))) {
      await userTest.makePaths()
    }
  }

  const notificationsManager = {
    sendEmailNotification: jest.fn().mockResolvedValue(undefined)
  }

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminUsersManager,
        AdminUsersQueries,
        UsersManager,
        UsersQueries,
        { provide: NotificationsManager, useValue: notificationsManager },
        { provide: AuthManager, useValue: {} },
        { provide: DB_TOKEN_PROVIDER, useValue: {} },
        { provide: Cache, useValue: {} }
      ]
    }).compile()
    module.useLogger(['fatal'])
    usersManager = module.get(UsersManager)
    adminUsersManager = module.get(AdminUsersManager)
    adminUsersQueries = module.get(AdminUsersQueries)
    usersQueriesService = module.get(UsersQueries)
    userTest = new UserModel(generateUserTest(), false)
    deleteUserDto = { deleteSpace: true } satisfies DeleteUserDto
  })

  afterEach(() => jest.restoreAllMocks())

  afterAll(async () => {
    await expect(adminUsersManager.deleteUserSpace(userTest.login)).resolves.not.toThrow()
  })

  it('instances + findUser/me/fromUserId + impersonation', async () => {
    expect(usersManager && adminUsersManager && usersQueriesService && userTest).toBeDefined()
    usersQueriesService.from = jest.fn().mockReturnValue(userTest)
    const u1: any = await usersManager.findUser(userTest.login, true)
    expect(u1).toBeInstanceOf(UserModel)
    expect(u1.password).toBeUndefined()
    const u2 = await usersManager.findUser(userTest.login, false)
    expect(u2).toBeInstanceOf(UserModel)
    expect(u2.password).toBeDefined()
    const me1: any = await usersManager.me(userTest)
    expect(me1.user.password).toBeUndefined()
    usersQueriesService.from = jest.fn().mockReturnValue(null)
    await expect(usersManager.findUser('unknown')).resolves.toBeNull()
    await expect(usersManager.me({ id: 0 } as UserModel)).rejects.toThrow()
    usersQueriesService.from = jest.fn().mockResolvedValue(null)
    await expect(usersManager.fromUserId(123)).resolves.toBeNull()
    const authUser = new UserModel({ ...generateUserTest(), id: 42, clientId: 'CID', impersonatedFromId: 1 } as any, true)
    const fromUser = new UserModel({ ...generateUserTest(), id: 42 }, true)
    usersQueriesService.from = jest.fn().mockResolvedValue(fromUser)
    const me2 = await usersManager.me(authUser)
    expect(me2.user.impersonated).toBe(true)
    expect(me2.user.clientId).toBe('CID')
  })

  it('paths + avatars (default/generate) + create/delete user', async () => {
    await expect(ensurePaths()).resolves.not.toThrow()
    expect(await isPathExists(userTest.filesPath)).toBe(true)
    usersQueriesService.from = jest.fn().mockReturnValueOnce(userTest)
    const [p0, m0] = await usersManager.getAvatar(userTest.login)
    expect(fileName(p0)).toBe('avatar.svg')
    expect(m0).toBe(svgMimeType)
    usersQueriesService.from = jest.fn().mockReturnValueOnce(null)
    await expect(usersManager.getAvatar('#', true)).rejects.toThrow('does not exist')
    usersQueriesService.from = jest.fn().mockReturnValue(userTest)
    expect(await usersManager.getAvatar(userTest.login, true)).toBeUndefined()
    const [p1, m1] = await usersManager.getAvatar(userTest.login)
    expect(fileName(p1)).toBe('avatar.png')
    expect(m1).toBe(pngMimeType)

    usersQueriesService.checkUserExists = jest.fn().mockReturnValue(undefined)
    usersQueriesService.createUserOrGuest = jest.fn().mockReturnValue(888)
    const created = await adminUsersManager.createUserOrGuest(userTest satisfies CreateUserDto, USER_ROLE.USER)
    expect(created).toBeInstanceOf(UserModel)
    expect(await isPathExists(created.filesPath)).toBe(true)

    usersQueriesService.checkUserExists = jest
      .fn()
      .mockReturnValueOnce({ login: userTest.login, email: '' })
      .mockReturnValueOnce({ login: '', email: userTest.email })
      .mockReturnValueOnce(undefined)
    await expect(adminUsersManager.createUserOrGuest(userTest satisfies CreateUserDto, USER_ROLE.USER)).rejects.toThrow()
    await expect(adminUsersManager.createUserOrGuest(userTest satisfies CreateUserDto, USER_ROLE.USER)).rejects.toThrow()
    usersQueriesService.createUserOrGuest = jest.fn().mockImplementation(() => {
      throw new Error('testing')
    })
    await expect(adminUsersManager.createUserOrGuest(userTest satisfies CreateUserDto, USER_ROLE.USER)).rejects.toThrow()

    adminUsersQueries.deleteUser = jest.fn().mockReturnValue(true)
    await expect(adminUsersManager.deleteUserOrGuest(userTest.id, userTest.login, deleteUserDto)).resolves.not.toThrow()
    expect(await isPathExists(userTest.filesPath)).toBe(false)
    adminUsersQueries.deleteUser = jest.fn().mockReturnValue(false)
    await expect(adminUsersManager.deleteUserOrGuest(userTest.id, userTest.login, deleteUserDto)).resolves.not.toThrow()
    adminUsersQueries.deleteUser = jest.fn().mockImplementation(() => {
      throw new Error('testing')
    })
    await expect(adminUsersManager.deleteUserOrGuest(userTest.id, userTest.login, deleteUserDto)).rejects.toThrow()
  })

  it('logUser branches: forbidden/locked/bad/good', async () => {
    const linkUser = new UserModel({ ...generateUserTest(), role: USER_ROLE.LINK }, false)
    await expect(usersManager.logUser(linkUser, 'x', '127.0.0.1')).rejects.toThrow('Account is not allowed')

    const uLocked = new UserModel({ ...generateUserTest(), isActive: false, passwordAttempts: 5 }, false)
    const errSpy = jest.spyOn((usersManager as any)['logger'], 'error').mockImplementation(() => undefined as any)
    const updSpy1 = jest.spyOn(usersManager, 'updateAccesses').mockRejectedValue(new Error('reject-locked'))
    await expect(usersManager.logUser(uLocked, 'pwd', 'ip')).rejects.toThrow('Account locked')
    await flush()
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('reject-locked'))
    expect(updSpy1).toHaveBeenCalledWith(uLocked, 'ip', false)
    ;(comparePassword as jest.Mock).mockResolvedValue(false)
    const uBad = new UserModel({ ...generateUserTest(), isActive: true, passwordAttempts: 0 }, false)
    const errSpy2 = jest.spyOn((usersManager as any)['logger'], 'error').mockImplementation(() => undefined as any)
    const updSpy2 = jest.spyOn(usersManager, 'updateAccesses').mockRejectedValue(new Error('reject-auth'))
    const out = await usersManager.logUser(uBad, 'bad', '1.1.1.1')
    expect(out).toBeNull()
    await flush()
    expect(errSpy2).toHaveBeenCalledWith(expect.stringContaining('reject-auth'))
    expect(updSpy2).toHaveBeenCalledWith(uBad, '1.1.1.1', false)
    ;(comparePassword as jest.Mock).mockResolvedValue(true)
    const uGood = new UserModel({ ...generateUserTest(), isActive: true, passwordAttempts: 0 }, false)
    const updSpy3 = jest.spyOn(usersManager, 'updateAccesses').mockResolvedValue(undefined)
    const pathsSpy = jest.spyOn(uGood, 'makePaths').mockResolvedValue(undefined)
    const out2 = await usersManager.logUser(uGood, 'good', '8.8.8.8')
    expect(out2).toBe(uGood)
    expect(updSpy3).toHaveBeenCalledWith(uGood, '8.8.8.8', true)
    expect(pathsSpy).toHaveBeenCalled()
  })

  it('compareUserPassword + updateLanguage + updatePassword branches', async () => {
    usersQueriesService.compareUserPassword = jest.fn().mockResolvedValue(true)
    await expect(usersManager.compareUserPassword(1, 'p')).resolves.toBe(true)
    expect(usersQueriesService.compareUserPassword).toHaveBeenCalledWith(1, 'p')

    usersQueriesService.updateUserOrGuest = jest.fn().mockResolvedValue(false)
    await expect(usersManager.updateLanguage(userTest, { language: '' })).rejects.toThrow('Unable to update language')
    expect(usersQueriesService.updateUserOrGuest).toHaveBeenCalledWith(userTest.id, { language: null })
    usersQueriesService.updateUserOrGuest = jest.fn().mockResolvedValue(true)
    await expect(usersManager.updateLanguage(userTest, { language: 'fr' })).resolves.toBeUndefined()

    usersQueriesService.selectUserProperties = jest.fn().mockResolvedValue(null)
    await expect(usersManager.updatePassword(userTest, { oldPassword: 'a', newPassword: 'b' })).rejects.toThrow('Unable to check password')
    usersQueriesService.selectUserProperties = jest.fn().mockResolvedValue({ password: 'HASH' })
    ;(comparePassword as jest.Mock).mockResolvedValue(false)
    await expect(usersManager.updatePassword(userTest, { oldPassword: 'a', newPassword: 'b' })).rejects.toThrow('Password mismatch')
    ;(comparePassword as jest.Mock).mockResolvedValue(true)
    ;(bcrypt.hash as unknown as jest.Mock).mockResolvedValue('HASHED')
    usersQueriesService.updateUserOrGuest = jest.fn().mockResolvedValue(true)
    await expect(usersManager.updatePassword(userTest, { oldPassword: 'a', newPassword: 'b' })).resolves.toBeUndefined()
    expect(usersQueriesService.updateUserOrGuest).toHaveBeenCalledWith(userTest.id, { password: 'HASHED' })
    usersQueriesService.updateUserOrGuest = jest.fn().mockResolvedValue(false)
    usersQueriesService.selectUserProperties = jest.fn().mockResolvedValue({ password: 'HASH' })
    ;(comparePassword as jest.Mock).mockResolvedValue(true)
    ;(bcrypt.hash as unknown as jest.Mock).mockResolvedValue('HASHED2')
    await expect(usersManager.updatePassword(userTest, { oldPassword: 'a', newPassword: 'b' })).rejects.toThrow('Unable to update password')
  })

  it('updateNotification + updateAccesses branches', async () => {
    usersQueriesService.updateUserOrGuest = jest.fn().mockResolvedValue(false)
    await expect(usersManager.updateNotification(userTest, { notification: 1 })).rejects.toThrow('Unable to update notification')
    usersQueriesService.updateUserOrGuest = jest.fn().mockResolvedValue(true)
    await expect(usersManager.updateNotification(userTest, { notification: 2 })).resolves.toBeUndefined()

    const prevAccess1 = new Date('2021-01-01T00:00:00Z')
    const u1 = new UserModel(
      { ...generateUserTest(), isActive: true, passwordAttempts: 3, currentIp: '1.2.3.4', currentAccess: prevAccess1 } as any,
      false
    )
    usersQueriesService.updateUserOrGuest = jest.fn().mockResolvedValue(true)
    await expect(usersManager.updateAccesses(u1, '5.6.7.8', true)).resolves.toBeUndefined()
    const payload1 = (usersQueriesService.updateUserOrGuest as jest.Mock).mock.calls[0][1]
    expect(payload1).toMatchObject({ lastIp: '1.2.3.4', currentIp: '5.6.7.8', passwordAttempts: 0, isActive: true })
    expect(payload1.lastAccess).toBe(prevAccess1)
    expect(payload1.currentAccess).toBeInstanceOf(Date)

    const prevAccess2 = new Date('2022-02-02T00:00:00Z')
    const u2 = new UserModel(
      {
        ...generateUserTest(),
        isActive: true,
        passwordAttempts: USER_MAX_PASSWORD_ATTEMPTS - 1,
        currentIp: 'old.ip',
        currentAccess: prevAccess2
      } as any,
      false
    )
    usersQueriesService.updateUserOrGuest = jest.fn().mockResolvedValue(true)
    await expect(usersManager.updateAccesses(u2, 'new.ip', false)).resolves.toBeUndefined()
    const payload2 = (usersQueriesService.updateUserOrGuest as jest.Mock).mock.calls[0][1]
    expect(payload2.passwordAttempts).toBe(USER_MAX_PASSWORD_ATTEMPTS)
    expect(payload2.isActive).toBe(false)
    expect(payload2.lastAccess).toBe(prevAccess2)
    expect(payload2.lastIp).toBe('old.ip')
    expect(payload2.currentIp).toBe('new.ip')
    expect(payload2.currentAccess).toBeInstanceOf(Date)
  })

  it('avatars advanced: generateIsNotExists, failure branches, base64 fallback', async () => {
    await ensurePaths()
    usersManager.findUser = jest.fn().mockResolvedValue({ getInitials: () => 'UT' } as unknown as UserModel)
    const [p, m] = (await usersManager.getAvatar(userTest.login, false, true)) as [string, string]
    expect(fileName(p)).toBe('avatar.png')
    expect(m).toBe(pngMimeType)
    jest.spyOn(imageModule, 'generateAvatar').mockImplementation(() => errStream('gen error'))
    await expect(usersManager.getAvatar(userTest.login, true)).rejects.toThrow('Unable to create avatar')
    usersManager.findUser = jest.fn().mockResolvedValue(null)
    await expect(usersManager.getAvatar(userTest.login, true)).rejects.toThrow('avatar not found')
  })

  it('updateAvatar branches: mime error, stream error, truncated, move fail, success', async () => {
    await ensurePaths()
    await expect(usersManager.updateAvatar(mkReq('text/plain', okStream('X')) as any)).rejects.toThrow('Unsupported file type')
    await expect(usersManager.updateAvatar(mkReq('image/png', errStream('stream error')) as any)).rejects.toThrow('Unable to upload avatar')

    const t = okStream('OK')
    t.truncated = true
    const mvSpy = jest.spyOn(filesUtilsModule, 'moveFiles').mockResolvedValue(undefined)
    await expect(usersManager.updateAvatar(mkReq('image/png', t) as any)).rejects.toThrow('Image is too large (5MB max)')
    expect(mvSpy).not.toHaveBeenCalled()

    jest.spyOn(filesUtilsModule, 'moveFiles').mockRejectedValue(new Error('mv fail'))
    await expect(usersManager.updateAvatar(mkReq('image/png', okStream()) as any)).rejects.toThrow('Unable to create avatar')

    const mvSpy2 = jest.spyOn(filesUtilsModule, 'moveFiles').mockResolvedValue(undefined)
    await expect(usersManager.updateAvatar(mkReq('image/png', okStream()) as any)).resolves.toBeUndefined()
    const expectedSrc = path.join(userTest.tmpPath, 'avatar.png')
    const expectedDst = path.join(userTest.homePath, 'avatar.png')
    expect(mvSpy2).toHaveBeenCalledWith(expectedSrc, expectedDst, true)
  })

  it('setOnlineStatus + browseGroups + getGroup', async () => {
    usersQueriesService.setOnlineStatus = jest.fn().mockRejectedValue(new Error('boom'))
    expect(() => usersManager.setOnlineStatus({ id: 1 } as any, 1 as any)).not.toThrow()

    usersQueriesService.browseRootGroups = jest.fn().mockResolvedValue([{ id: 1 }])
    const root = await usersManager.browseGroups(userTest, '')
    expect(root.parentGroup).toBeUndefined()
    expect(root.members.length).toBe(1)
    usersQueriesService.groupFromName = jest.fn().mockResolvedValue(null)
    await expect(usersManager.browseGroups(userTest, 'unknown')).rejects.toThrow('Group not found')
    const group = { id: 42, name: 'Team' }
    usersQueriesService.groupFromName = jest.fn().mockResolvedValue(group)
    usersQueriesService.browseGroupMembers = jest.fn().mockResolvedValue([{ id: 7 }, { id: 8 }])
    const g2 = await usersManager.browseGroups(userTest, 'Team')
    expect(g2.parentGroup).toEqual(group)
    expect(g2.members).toEqual([{ id: 7 }, { id: 8 }])
    expect(usersQueriesService.browseGroupMembers).toHaveBeenCalledWith(42)

    usersQueriesService.getGroupWithMembers = jest.fn().mockResolvedValue({ id: 1, members: [] })
    await expect(usersManager.getGroup(userTest, 1)).resolves.toEqual({ id: 1, members: [] })
    usersQueriesService.getGroup = jest.fn().mockResolvedValue({ id: 2 })
    await expect(usersManager.getGroup(userTest, 2, false)).resolves.toEqual({ id: 2 })
    usersQueriesService.getGroup = jest.fn().mockResolvedValue(null)
    await expect(usersManager.getGroup(userTest, 3, false)).rejects.toThrow('You are not allowed to do this action')
  })

  it('create/update personal group', async () => {
    await expect(usersManager.createPersonalGroup(userTest, { name: '' } as any)).rejects.toThrow('Group name is missing')
    usersQueriesService.checkGroupNameExists = jest.fn().mockResolvedValue(true)
    await expect(usersManager.createPersonalGroup(userTest, { name: 'A' })).rejects.toThrow('Name already used')
    usersQueriesService.checkGroupNameExists = jest.fn().mockResolvedValue(false)
    usersQueriesService.createPersonalGroup = jest.fn().mockResolvedValue(10)
    usersQueriesService.clearWhiteListCaches = jest.fn()
    usersManager.getGroup = jest.fn().mockResolvedValue({ id: 10 })
    const logSpy = jest.spyOn((usersManager as any)['logger'], 'log').mockImplementation(() => undefined as any)
    await expect(usersManager.createPersonalGroup(userTest, { name: 'OK' })).resolves.toEqual({ id: 10 })
    expect(logSpy).toHaveBeenCalled()
    usersQueriesService.createPersonalGroup = jest.fn().mockRejectedValue(new Error('db down'))
    await expect(usersManager.createPersonalGroup(userTest, { name: 'OK' })).rejects.toThrow('Unable to create group')

    await expect(usersManager.updatePersonalGroup(userTest, 1, {} as any)).rejects.toThrow('No changes to update')
    usersManager.getGroup = jest.fn().mockResolvedValueOnce({ id: 1, type: MEMBER_TYPE.GROUP })
    await expect(usersManager.updatePersonalGroup(userTest, 1, { name: 'x' })).rejects.toThrow('You are not allowed to do this action')
    usersManager.getGroup = jest.fn().mockResolvedValue({ id: 1, type: MEMBER_TYPE.PGROUP })
    usersQueriesService.checkGroupNameExists = jest.fn().mockResolvedValue(true)
    await expect(usersManager.updatePersonalGroup(userTest, 1, { name: 'dup' })).rejects.toThrow('Name already used')
    usersQueriesService.checkGroupNameExists = jest.fn().mockResolvedValue(false)
    usersQueriesService.updateGroup = jest.fn().mockRejectedValue(new Error('oops'))
    await expect(usersManager.updatePersonalGroup(userTest, 1, { name: 'ok' })).rejects.toThrow('oops')
    usersQueriesService.updateGroup = jest.fn().mockResolvedValue(true)
    usersManager.getGroup = jest.fn().mockResolvedValue({ id: 1, type: MEMBER_TYPE.PGROUP })
    await expect(usersManager.updatePersonalGroup(userTest, 1, { name: 'ok' })).resolves.not.toThrow()
    expect(usersManager.getGroup).toHaveBeenCalledWith(userTest, 1, false, userTest.isAdmin)
  })

  it('addUsersToGroup (GROUP/PGROUP)', async () => {
    usersManager.getGroup = jest.fn().mockResolvedValue({ id: 1, type: MEMBER_TYPE.GROUP, members: [{ id: 2 }, { id: 3 }] })
    usersQueriesService.usersWhitelist = jest.fn().mockResolvedValue([3, 4, 5])
    await expect(usersManager.addUsersToGroup(userTest, 1, [2, 3])).rejects.toThrow('No users to add to group')
    usersQueriesService.updateGroupMembers = jest.fn().mockResolvedValue(undefined)
    await expect(usersManager.addUsersToGroup(userTest, 1, [3, 4, 5])).resolves.toBeUndefined()
    expect(usersQueriesService.updateGroupMembers).toHaveBeenCalledWith(1, {
      add: [
        { id: 4, groupRole: USER_GROUP_ROLE.MEMBER },
        { id: 5, groupRole: USER_GROUP_ROLE.MEMBER }
      ]
    })
    expect(usersQueriesService.usersWhitelist).toHaveBeenCalledWith(userTest.id, USER_ROLE.USER)

    usersManager.getGroup = jest.fn().mockResolvedValue({ id: 2, type: MEMBER_TYPE.PGROUP, members: [] })
    usersQueriesService.usersWhitelist = jest.fn().mockResolvedValue([10, 11])
    usersQueriesService.updateGroupMembers = jest.fn().mockResolvedValue(undefined)
    await expect(usersManager.addUsersToGroup(userTest, 2, [10, 11])).resolves.toBeUndefined()
    expect(usersQueriesService.usersWhitelist).toHaveBeenCalledWith(userTest.id, undefined)
    expect(usersQueriesService.updateGroupMembers).toHaveBeenCalledWith(2, {
      add: [
        { id: 10, groupRole: USER_GROUP_ROLE.MEMBER },
        { id: 11, groupRole: USER_GROUP_ROLE.MEMBER }
      ]
    })
  })

  it('updateUserFromPersonalGroup', async () => {
    usersManager.getGroup = jest.fn().mockResolvedValue({ id: 1, type: MEMBER_TYPE.GROUP, members: [] })
    await expect(usersManager.updateUserFromPersonalGroup(userTest, 1, 9, { role: 1 })).rejects.toThrow('You are not allowed to do this action')
    usersManager.getGroup = jest.fn().mockResolvedValue({ id: 1, type: MEMBER_TYPE.PGROUP, members: [] })
    await expect(usersManager.updateUserFromPersonalGroup(userTest, 1, 9, { role: 1 })).rejects.toThrow('User was not found')
    usersManager.getGroup = jest.fn().mockResolvedValue({
      id: 1,
      type: MEMBER_TYPE.PGROUP,
      members: [
        { id: 9, groupRole: USER_GROUP_ROLE.MANAGER },
        { id: 10, groupRole: USER_GROUP_ROLE.MEMBER }
      ]
    })
    await expect(usersManager.updateUserFromPersonalGroup(userTest, 1, 9, { role: USER_GROUP_ROLE.MEMBER })).rejects.toThrow(
      /group must have at least one manager/i
    )
    const spy = jest.spyOn(adminUsersManager, 'updateUserFromGroup').mockResolvedValue(undefined)
    usersManager.getGroup = jest.fn().mockResolvedValue({
      id: 1,
      type: MEMBER_TYPE.PGROUP,
      members: [
        { id: 9, groupRole: USER_GROUP_ROLE.MEMBER },
        { id: 10, groupRole: USER_GROUP_ROLE.MEMBER },
        { id: 11, groupRole: USER_GROUP_ROLE.MEMBER }
      ]
    })
    await expect(usersManager.updateUserFromPersonalGroup(userTest, 1, 9, { role: USER_GROUP_ROLE.MANAGER })).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalledWith(1, 9, { role: 1 })
    usersManager.getGroup = jest.fn().mockResolvedValue({ id: 1, type: MEMBER_TYPE.PGROUP, members: [{ id: 9, groupRole: USER_GROUP_ROLE.MEMBER }] })
    await expect(usersManager.updateUserFromPersonalGroup(userTest, 1, 9, { role: USER_GROUP_ROLE.MEMBER })).resolves.toBeUndefined()
    ;(spy as jest.Mock).mockClear()
    usersManager.getGroup = jest.fn().mockResolvedValue({
      id: 1,
      type: MEMBER_TYPE.PGROUP,
      members: [
        { id: 9, groupRole: USER_GROUP_ROLE.MANAGER },
        { id: 10, groupRole: USER_GROUP_ROLE.MANAGER }
      ]
    })
    await expect(usersManager.updateUserFromPersonalGroup(userTest, 1, 9, { role: USER_GROUP_ROLE.MEMBER })).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalledWith(1, 9, { role: USER_GROUP_ROLE.MEMBER })
    ;(spy as jest.Mock).mockClear()
    usersManager.getGroup = jest.fn().mockResolvedValue({
      id: 1,
      type: MEMBER_TYPE.PGROUP,
      members: [
        { id: 9, groupRole: USER_GROUP_ROLE.MANAGER },
        { id: 10, groupRole: USER_GROUP_ROLE.MANAGER }
      ]
    })
    await expect(usersManager.updateUserFromPersonalGroup(userTest, 1, 9, { role: USER_GROUP_ROLE.MANAGER })).resolves.toBeUndefined()
    expect(spy).not.toHaveBeenCalled()
  })

  it('removeUserFromGroup', async () => {
    usersManager.getGroup = jest.fn().mockResolvedValue({ id: 1, members: [] })
    await expect(usersManager.removeUserFromGroup(userTest, 1, 9)).rejects.toThrow('User was not found')
    usersManager.getGroup = jest.fn().mockResolvedValue({ id: 1, type: MEMBER_TYPE.GROUP, members: [{ id: 9, groupRole: USER_GROUP_ROLE.MANAGER }] })
    await expect(usersManager.removeUserFromGroup(userTest, 1, 9)).rejects.toThrow('You are not allowed to do this action')
    usersManager.getGroup = jest.fn().mockResolvedValue({ id: 1, type: MEMBER_TYPE.PGROUP, members: [{ id: 9, groupRole: USER_GROUP_ROLE.MANAGER }] })
    await expect(usersManager.removeUserFromGroup(userTest, 1, 9)).rejects.toThrow('Group must have at least one manager')
    usersQueriesService.updateGroupMembers = jest.fn().mockResolvedValue(undefined)
    usersManager.getGroup = jest.fn().mockResolvedValue({
      id: 1,
      type: MEMBER_TYPE.PGROUP,
      members: [
        { id: 9, groupRole: USER_GROUP_ROLE.MEMBER },
        { id: 10, groupRole: USER_GROUP_ROLE.MANAGER }
      ]
    })
    await expect(usersManager.removeUserFromGroup(userTest, 1, 9)).resolves.toBeUndefined()
    expect(usersQueriesService.updateGroupMembers).toHaveBeenCalledWith(1, { remove: [9] })
    usersQueriesService.updateGroupMembers = jest.fn().mockResolvedValue(undefined)
    usersManager.getGroup = jest.fn().mockResolvedValue({
      id: 1,
      type: MEMBER_TYPE.PGROUP,
      members: [
        { id: 9, groupRole: USER_GROUP_ROLE.MANAGER },
        { id: 10, groupRole: USER_GROUP_ROLE.MANAGER }
      ]
    })
    await expect(usersManager.removeUserFromGroup(userTest, 1, 9)).resolves.toBeUndefined()
    expect(usersQueriesService.updateGroupMembers).toHaveBeenCalledWith(1, { remove: [9] })
  })

  it('leave/delete personal group', async () => {
    usersQueriesService.getGroupWithMembers = jest.fn().mockResolvedValue(null)
    await expect(usersManager.leavePersonalGroup(userTest, 1)).rejects.toThrow('You are not allowed to do this action')
    usersQueriesService.getGroupWithMembers = jest.fn().mockResolvedValue({ id: 1, type: MEMBER_TYPE.GROUP, members: [{ id: userTest.id }] })
    await expect(usersManager.leavePersonalGroup(userTest, 1)).rejects.toThrow('You are not allowed to do this action')
    usersQueriesService.getGroupWithMembers = jest.fn().mockResolvedValue({ id: 1, type: MEMBER_TYPE.PGROUP, members: [] })
    await expect(usersManager.leavePersonalGroup(userTest, 1)).rejects.toThrow('User was not found')
    usersQueriesService.getGroupWithMembers = jest.fn().mockResolvedValue({
      id: 1,
      type: MEMBER_TYPE.PGROUP,
      members: [{ id: userTest.id, groupRole: USER_GROUP_ROLE.MANAGER }]
    })
    await expect(usersManager.leavePersonalGroup(userTest, 1)).rejects.toThrow('Group must have at least one manager')
    usersQueriesService.getGroupWithMembers = jest.fn().mockResolvedValue({
      id: 1,
      type: 2,
      members: [
        { id: userTest.id, groupRole: USER_GROUP_ROLE.MEMBER },
        { id: 9, groupRole: USER_GROUP_ROLE.MANAGER }
      ]
    })
    const lSpy = jest.spyOn((usersManager as any)['logger'], 'log').mockImplementation(() => undefined as any)
    usersQueriesService.updateGroupMembers = jest.fn().mockResolvedValue(undefined)
    await expect(usersManager.leavePersonalGroup(userTest, 1)).resolves.toBeUndefined()
    expect(lSpy).toHaveBeenCalledWith(expect.stringMatching(/has left group/))
    usersQueriesService.updateGroupMembers = jest.fn().mockRejectedValue(new Error('DB'))
    await expect(usersManager.leavePersonalGroup(userTest, 1)).rejects.toThrow('DB')
    usersQueriesService.getGroupWithMembers = jest.fn().mockResolvedValue({
      id: 1,
      type: MEMBER_TYPE.PGROUP,
      members: [
        { id: userTest.id, groupRole: USER_GROUP_ROLE.MANAGER },
        { id: 9, groupRole: USER_GROUP_ROLE.MANAGER }
      ]
    })
    usersQueriesService.updateGroupMembers = jest.fn().mockResolvedValue(undefined)
    await expect(usersManager.leavePersonalGroup(userTest, 1)).resolves.toBeUndefined()

    usersQueriesService.canDeletePersonalGroup = jest.fn().mockResolvedValue(false)
    await expect(usersManager.deletePersonalGroup(userTest, 7)).rejects.toThrow('You are not allowed to do this action')
    usersQueriesService.canDeletePersonalGroup = jest.fn().mockResolvedValue(true)
    const wSpy = jest.spyOn((usersManager as any)['logger'], 'warn').mockImplementation(() => undefined as any)
    usersQueriesService.deletePersonalGroup = jest.fn().mockResolvedValue(false)
    await expect(usersManager.deletePersonalGroup(userTest, 7)).rejects.toThrow('Unable to delete group')
    expect(wSpy).toHaveBeenCalledWith(expect.stringMatching(/does not exist/))
    const lgSpy = jest.spyOn((usersManager as any)['logger'], 'log').mockImplementation(() => undefined as any)
    usersQueriesService.deletePersonalGroup = jest.fn().mockResolvedValue(true)
    await expect(usersManager.deletePersonalGroup(userTest, 7)).resolves.toBeUndefined()
    expect(lgSpy).toHaveBeenCalledWith(expect.stringMatching(/was deleted/))
  })

  it('guests + proxies', async () => {
    usersQueriesService.listGuests = jest.fn().mockResolvedValue([{ id: 1 }])
    await expect(usersManager.listGuests(userTest)).resolves.toEqual([{ id: 1 }])
    const checkSpy = jest.spyOn(adminUsersManager, 'checkUser').mockImplementation(() => undefined)
    usersQueriesService.listGuests = jest.fn().mockResolvedValue({ id: 9 })
    await expect(usersManager.getGuest(userTest, 9)).resolves.toEqual({ id: 9 })
    expect(checkSpy).toHaveBeenCalled()

    usersQueriesService.usersWhitelist = jest.fn().mockResolvedValue([userTest.id, 100])
    usersQueriesService.clearWhiteListCaches = jest.fn()
    const createSpy = jest.spyOn(adminUsersManager, 'createUserOrGuest').mockResolvedValue({ id: 55 } as any)
    const dto1: CreateUserDto = { ...userTest, managers: [100], password: 'x' }
    const r = await usersManager.createGuest(userTest, dto1)
    expect(createSpy).toHaveBeenCalled()
    expect(usersQueriesService.clearWhiteListCaches).toHaveBeenCalledWith([userTest.id])
    expect(r).toEqual({ id: 55 })
    const args1 = (createSpy as jest.Mock).mock.calls[0][0]
    expect(args1.managers).toEqual(expect.arrayContaining([userTest.id]))
    ;(createSpy as jest.Mock).mockClear()
    const dto2: CreateUserDto = { ...userTest, managers: [userTest.id, 100], password: 'y' }
    await usersManager.createGuest(userTest, dto2)
    const args2 = (createSpy as jest.Mock).mock.calls[0][0]
    expect((args2.managers as number[]).filter((m: number) => m === userTest.id)).toHaveLength(1)

    await expect(usersManager.updateGuest(userTest, 9, {} as any)).rejects.toThrow('No changes to update')
    usersQueriesService.usersWhitelist = jest.fn().mockResolvedValue([1])
    await expect(usersManager.updateGuest(userTest, 9, { managers: [2] } as any)).rejects.toThrow('Guest must have at least one manager')
    usersQueriesService.isGuestManager = jest.fn().mockResolvedValue(false)
    await expect(usersManager.updateGuest(userTest, 9, { email: 'a' } as any)).rejects.toThrow('You are not allowed to do this action')
    usersQueriesService.isGuestManager = jest.fn().mockResolvedValue(true)
    jest.spyOn(adminUsersManager, 'updateUserOrGuest').mockResolvedValue({ managers: [{ id: 999 }] } as any)
    await expect(usersManager.updateGuest(userTest, 9, { email: 'a' } as any)).resolves.toBeNull()
    jest.spyOn(adminUsersManager, 'updateUserOrGuest').mockResolvedValue({ managers: [{ id: userTest.id }] } as any)
    await expect(usersManager.updateGuest(userTest, 9, { email: 'a' } as any)).resolves.toEqual({ managers: [{ id: userTest.id }] })
    usersQueriesService.usersWhitelist = jest.fn().mockResolvedValue([userTest.id, 77])
    usersQueriesService.isGuestManager = jest.fn().mockResolvedValue(true)
    jest.spyOn(adminUsersManager, 'updateUserOrGuest').mockResolvedValue({ managers: [{ id: userTest.id }, { id: 77 }] } as any)
    await expect(usersManager.updateGuest(userTest, 9, { managers: [userTest.id, 77] } as any)).resolves.toEqual({
      managers: [{ id: userTest.id }, { id: 77 }]
    })

    usersQueriesService.isGuestManager = jest.fn().mockResolvedValue(null)
    await expect(usersManager.deleteGuest(userTest, 9)).rejects.toThrow('You are not allowed to do this action')
    usersQueriesService.isGuestManager = jest.fn().mockResolvedValue({ id: 9, login: 'guest' })
    const delSpy = jest.spyOn(adminUsersManager, 'deleteUserOrGuest').mockResolvedValue(undefined)
    await expect(usersManager.deleteGuest(userTest, 9)).resolves.toBeUndefined()
    expect(delSpy).toHaveBeenCalledWith(9, 'guest', { deleteSpace: true, isGuest: true })

    usersQueriesService.searchUsersOrGroups = jest.fn().mockResolvedValue([{ id: 1 }])
    await expect(usersManager.searchMembers(userTest, { search: '' } as any)).resolves.toEqual([{ id: 1 }])

    usersQueriesService.getOnlineUsers = jest.fn().mockResolvedValue([{ id: 123 }])
    await expect(usersManager.getOnlineUsers([123])).resolves.toEqual([{ id: 123 }])
    expect(usersQueriesService.getOnlineUsers).toHaveBeenCalledWith([123])
    usersQueriesService.usersWhitelist = jest.fn().mockResolvedValue([10, 11])
    await expect(usersManager.usersWhitelist(userTest.id)).resolves.toEqual([10, 11])
    expect(usersQueriesService.usersWhitelist).toHaveBeenCalledWith(userTest.id)
  })
})
