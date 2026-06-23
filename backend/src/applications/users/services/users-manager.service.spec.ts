import { HttpStatus } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import bcrypt from 'bcryptjs'
import { SQL } from 'drizzle-orm'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { AuthManager } from '../../../authentication/auth.service'
import { AUTH_SCOPE } from '../../../authentication/constants/scope'
import { comparePassword } from '../../../common/functions'
import * as imageModule from '../../../common/image'
import { pngMimeType, svgMimeType } from '../../../common/image'
import { configuration } from '../../../configuration/config.environment'
import { Cache } from '../../../infrastructure/cache/cache.service'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants'
import { fileName, isPathExists } from '../../files/utils/files'
import { NotificationsManager } from '../../notifications/services/notifications-manager.service'
import { GROUP_TYPE } from '../constants/group'
import { MEMBER_TYPE } from '../constants/member'
import { USER_GROUP_ROLE, USER_MAX_PASSWORD_ATTEMPTS, USER_PERMISSION, USER_ROLE } from '../constants/user'
import { CreateUserDto } from '../dto/create-or-update-user.dto'
import { DeleteUserDto } from '../dto/delete-user.dto'
import { UserModel } from '../models/user.model'
import { generateUserTest } from '../utils/test'
import { AdminUsersManager } from './admin-users-manager.service'
import { AdminUsersQueries } from './admin-users-queries.service'
import { UsersManager } from './users-manager.service'
import { UsersQueries } from './users-queries.service'
import { FilesQuotaManager } from '../../files/services/files-quota-manager.service'
import { Mock } from 'vitest'

vi.mock('../../../common/functions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../common/functions')>()
  return { ...actual, comparePassword: vi.fn() }
})
vi.mock('bcryptjs', () => ({ __esModule: true, default: { hash: vi.fn(() => Promise.resolve('hashed-password')) } }))
vi.mock('../../../common/image', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../common/image')>()
  return {
    ...actual,
    generateAvatar: vi.fn(() => Readable.from([Buffer.from('PNGDATA')])),
    convertTempImageToPng: vi.fn(() => Promise.resolve())
  }
})

describe(UsersManager.name, () => {
  let usersManager: UsersManager
  let adminUsersManager: AdminUsersManager
  let adminUsersQueries: AdminUsersQueries
  let usersQueriesService: UsersQueries
  let userTest: UserModel
  let deleteUserDto: DeleteUserDto
  let testDataPath: string
  const initialFilesPaths = {
    dataPath: configuration.applications.files.dataPath,
    usersPath: configuration.applications.files.usersPath,
    spacesPath: configuration.applications.files.spacesPath,
    tmpPath: configuration.applications.files.tmpPath
  }
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
  const mkReq = (mimetype: string, stream: any, user = userTest) => ({ user, file: vi.fn().mockResolvedValue({ mimetype, file: stream }) })
  const ensurePaths = async () => {
    if (!(await isPathExists(userTest.homePath))) {
      await userTest.makePaths()
    }
  }

  const notificationsManager = {
    sendEmailNotification: vi.fn().mockResolvedValue(undefined)
  }

  beforeAll(async () => {
    testDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sync-in-users-manager-spec-'))
    configuration.applications.files.dataPath = testDataPath
    configuration.applications.files.usersPath = path.join(testDataPath, 'users')
    configuration.applications.files.spacesPath = path.join(testDataPath, 'spaces')
    configuration.applications.files.tmpPath = path.join(testDataPath, 'tmp')

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminUsersManager,
        AdminUsersQueries,
        UsersManager,
        UsersQueries,
        {
          provide: FilesQuotaManager,
          useValue: { updateStorageQuota: () => vi.fn() }
        },
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
    deleteUserDto = { deleteSpace: true, isGuest: false } satisfies DeleteUserDto
  })

  afterEach(() => vi.restoreAllMocks())

  afterAll(async () => {
    await expect(adminUsersManager.deleteUserSpace(userTest.login)).resolves.not.toThrow()
    configuration.applications.files.dataPath = initialFilesPaths.dataPath
    configuration.applications.files.usersPath = initialFilesPaths.usersPath
    configuration.applications.files.spacesPath = initialFilesPaths.spacesPath
    configuration.applications.files.tmpPath = initialFilesPaths.tmpPath
    await fs.rm(testDataPath, { recursive: true, force: true })
  })

  it('instances + findUser/me/fromUserId + impersonation', async () => {
    expect(usersManager && adminUsersManager && usersQueriesService && userTest).toBeDefined()
    usersQueriesService.from = vi.fn().mockReturnValue(userTest)
    const u1: any = await usersManager.findUser(userTest.login, true)
    expect(u1).toBeInstanceOf(UserModel)
    expect(u1.password).toBeUndefined()
    const u2 = await usersManager.findUser(userTest.login, false)
    expect(u2).toBeInstanceOf(UserModel)
    expect(u2.password).toBeDefined()
    const me1: any = await usersManager.me(userTest)
    expect(me1.user.password).toBeUndefined()
    usersQueriesService.from = vi.fn().mockReturnValue(null)
    await expect(usersManager.findUser('unknown')).resolves.toBeNull()
    await expect(usersManager.me({ id: 0 } as UserModel)).rejects.toThrow()
    usersQueriesService.from = vi.fn().mockResolvedValue(null)
    await expect(usersManager.fromUserId(123)).resolves.toBeNull()
    const authUser = new UserModel({ ...generateUserTest(), id: 42, clientId: 'CID', impersonatedFromId: 1 } as any, true)
    const fromUser = new UserModel({ ...generateUserTest(), id: 42 }, true)
    usersQueriesService.from = vi.fn().mockResolvedValue(fromUser)
    const me2 = await usersManager.me(authUser)
    expect(me2.user.impersonated).toBe(true)
    expect(me2.user.clientId).toBe('CID')
  })

  it('should resolve token users from current database state', async () => {
    const authUser = new UserModel({
      ...generateUserTest(),
      id: 42,
      role: USER_ROLE.ADMINISTRATOR,
      applications: Object.values(USER_PERMISSION),
      clientId: 'client-id',
      exp: 1234
    } as any)
    const currentUser = {
      ...generateUserTest(),
      id: 42,
      role: USER_ROLE.USER,
      permissions: USER_PERMISSION.SPACES
    }
    usersQueriesService.from = vi.fn().mockResolvedValue(currentUser)

    const resolved = await usersManager.fromAuthToken(authUser)

    expect(resolved.role).toBe(USER_ROLE.USER)
    expect(resolved.applications).toEqual([USER_PERMISSION.SPACES])
    expect(resolved.clientId).toBe('client-id')
    expect(resolved.exp).toBe(1234)

    usersQueriesService.from = vi.fn().mockResolvedValue({ ...currentUser, isActive: false })
    await expect(usersManager.fromAuthToken(authUser)).resolves.toBeNull()
  })

  it('should validate the source administrator before restoring impersonation', async () => {
    const authUser = new UserModel({
      ...generateUserTest(),
      id: 42,
      impersonatedFromId: 1,
      impersonatedClientId: 'admin-client'
    } as any)
    const currentUser = { ...generateUserTest(), id: 42 }
    const admin = { ...generateUserTest(), id: 1, role: USER_ROLE.ADMINISTRATOR }
    usersQueriesService.from = vi.fn().mockImplementation(async (id: number) => (id === authUser.id ? currentUser : admin))

    const resolved = await usersManager.fromAuthToken(authUser)

    expect(resolved.impersonatedFromId).toBe(admin.id)
    expect(resolved.impersonatedClientId).toBe('admin-client')

    const formerAdmin = { ...generateUserTest(), id: 1, role: USER_ROLE.USER }
    usersQueriesService.from = vi.fn().mockImplementation(async (id: number) => (id === authUser.id ? currentUser : formerAdmin))

    await expect(usersManager.fromAuthToken(authUser)).resolves.toBeNull()
  })

  it('paths + avatars (default/generate) + create/delete user', async () => {
    await expect(ensurePaths()).resolves.not.toThrow()
    expect(await isPathExists(userTest.filesPath)).toBe(true)
    usersQueriesService.from = vi.fn().mockReturnValueOnce(userTest)
    const [p0, m0] = await usersManager.getAvatar(userTest.login)
    expect(fileName(p0)).toBe('avatar.svg')
    expect(m0).toBe(svgMimeType)
    usersQueriesService.from = vi.fn().mockReturnValueOnce(null)
    await expect(usersManager.getAvatar('#', true)).rejects.toThrow('does not exist')
    usersQueriesService.from = vi.fn().mockReturnValue(userTest)
    expect(await usersManager.getAvatar(userTest.login, true)).toBeUndefined()
    const [p1, m1] = await usersManager.getAvatar(userTest.login)
    expect(fileName(p1)).toBe('avatar.png')
    expect(m1).toBe(pngMimeType)

    usersQueriesService.checkUserExists = vi.fn().mockReturnValue(undefined)
    usersQueriesService.createUserOrGuest = vi.fn().mockReturnValue(888)
    usersQueriesService.clearWhiteListCaches = vi.fn()
    const created = await adminUsersManager.createUserOrGuest(userTest satisfies CreateUserDto, USER_ROLE.USER)
    expect(created).toBeInstanceOf(UserModel)
    expect(await isPathExists(created.filesPath)).toBe(true)

    usersQueriesService.checkUserExists = vi
      .fn()
      .mockReturnValueOnce({ login: userTest.login, email: '' })
      .mockReturnValueOnce({ login: '', email: userTest.email })
      .mockReturnValueOnce(undefined)
    await expect(adminUsersManager.createUserOrGuest(userTest satisfies CreateUserDto, USER_ROLE.USER)).rejects.toThrow()
    await expect(adminUsersManager.createUserOrGuest(userTest satisfies CreateUserDto, USER_ROLE.USER)).rejects.toThrow()
    usersQueriesService.createUserOrGuest = vi.fn().mockImplementation(() => {
      throw new Error('testing')
    })
    await expect(adminUsersManager.createUserOrGuest(userTest satisfies CreateUserDto, USER_ROLE.USER)).rejects.toThrow()

    adminUsersQueries.deleteUser = vi.fn().mockReturnValue(true)
    await expect(adminUsersManager.deleteUserOrGuest(userTest.id, userTest.login, deleteUserDto)).resolves.not.toThrow()
    expect(await isPathExists(userTest.filesPath)).toBe(false)
    adminUsersQueries.deleteUser = vi.fn().mockReturnValue(false)
    await expect(adminUsersManager.deleteUserOrGuest(userTest.id, userTest.login, deleteUserDto)).resolves.not.toThrow()
    adminUsersQueries.deleteUser = vi.fn().mockImplementation(() => {
      throw new Error('testing')
    })
    await expect(adminUsersManager.deleteUserOrGuest(userTest.id, userTest.login, deleteUserDto)).rejects.toThrow()
  })

  it('logUser branches: forbidden/locked/bad/good', async () => {
    const linkUser = new UserModel({ ...generateUserTest(), role: USER_ROLE.LINK }, false)
    await expect(usersManager.logUser(linkUser, 'x', '127.0.0.1')).rejects.toThrow('Account is not allowed')

    const uLocked = new UserModel({ ...generateUserTest(), isActive: false, passwordAttempts: 5 }, false)
    const errSpy = vi.spyOn((usersManager as any)['logger'], 'error').mockImplementation(() => undefined as any)
    const updSpy1 = vi.spyOn(usersManager, 'updateAccesses').mockRejectedValue(new Error('reject-locked'))
    await expect(usersManager.logUser(uLocked, 'pwd', 'ip')).rejects.toThrow('Account locked')
    await flush()
    expect(errSpy.mock.calls.some(([payload]: { msg: string }[]) => payload?.msg?.includes('reject-locked'))).toBe(true)
    expect(updSpy1).toHaveBeenCalledWith(uLocked, 'ip', false)
    vi.mocked(comparePassword).mockResolvedValue(false)
    const uBad = new UserModel({ ...generateUserTest(), isActive: true, passwordAttempts: 0 }, false)
    const errSpy2 = vi.spyOn((usersManager as any)['logger'], 'error').mockImplementation(() => undefined as any)
    const updSpy2 = vi.spyOn(usersManager, 'updateAccesses').mockRejectedValue(new Error('reject-auth'))
    const out = await usersManager.logUser(uBad, 'bad', '1.1.1.1')
    expect(out).toBeNull()
    await flush()
    expect(errSpy2.mock.calls.some(([payload]: { msg: string }[]) => payload?.msg?.includes('reject-auth'))).toBe(true)
    expect(updSpy2).toHaveBeenCalledWith(uBad, '1.1.1.1', false)
    vi.mocked(comparePassword).mockResolvedValue(true)
    const uGood = new UserModel({ ...generateUserTest(), isActive: true, passwordAttempts: 0 }, false)
    const updSpy3 = vi.spyOn(usersManager, 'updateAccesses').mockResolvedValue(undefined)
    const pathsSpy = vi.spyOn(uGood, 'makePaths').mockResolvedValue(undefined)
    const out2 = await usersManager.logUser(uGood, 'good', '8.8.8.8')
    expect(out2).toBe(uGood)
    expect(updSpy3).toHaveBeenCalledWith(uGood, '8.8.8.8', true)
    expect(pathsSpy).toHaveBeenCalled()
  })

  it('local password validation burns time when user is missing or rejected by policy', async () => {
    vi.mocked(comparePassword).mockResolvedValue(false)
    usersQueriesService.from = vi.fn().mockResolvedValue(null)

    await expect(usersManager.validateLocalPasswordByLogin('missing', 'pwd', '127.0.0.1')).resolves.toBeNull()
    expect(comparePassword).toHaveBeenCalledWith('pwd', null)

    await expect(usersManager.validateLocalPasswordForUser(null, 'missing', 'pwd', '127.0.0.1')).resolves.toBeNull()
    expect(comparePassword).toHaveBeenLastCalledWith('pwd', null)

    const localUser = new UserModel({ ...generateUserTest(), isActive: true, passwordAttempts: 0 }, false)
    usersQueriesService.from = vi.fn().mockResolvedValue(localUser)

    await expect(usersManager.validateLocalPasswordByLogin(localUser.login, 'pwd', '127.0.0.1', undefined, () => false)).resolves.toBeNull()
    expect(comparePassword).toHaveBeenLastCalledWith('pwd', null)
  })

  it('scoped local password validation burns app password timing when no app password is checked', async () => {
    vi.mocked(comparePassword).mockResolvedValue(false)
    vi.mocked(comparePassword).mockClear()
    usersQueriesService.from = vi.fn().mockResolvedValue(null)

    await expect(usersManager.validateLocalPasswordByLogin('missing', 'pwd', '127.0.0.1', AUTH_SCOPE.WEBDAV)).resolves.toBeNull()
    expect(comparePassword).toHaveBeenCalledTimes(2)
    expect(comparePassword).toHaveBeenNthCalledWith(1, 'pwd', null)
    expect(comparePassword).toHaveBeenNthCalledWith(2, 'pwd', null)

    vi.mocked(comparePassword).mockClear()
    const localUser = new UserModel({ ...generateUserTest(), role: USER_ROLE.USER, isActive: true, passwordAttempts: 0 }, false)
    usersQueriesService.getUserSecrets = vi.fn().mockResolvedValue({ appPasswords: [] })

    await expect(usersManager.validateAppPassword(localUser, 'pwd', '127.0.0.1', AUTH_SCOPE.WEBDAV)).resolves.toBe(false)
    expect(comparePassword).toHaveBeenCalledTimes(1)
    expect(comparePassword).toHaveBeenCalledWith('pwd', null)

    vi.mocked(comparePassword).mockClear()
    usersQueriesService.getUserSecrets = vi.fn().mockResolvedValue({
      appPasswords: [{ app: AUTH_SCOPE.CLIENT, password: 'APP_HASH' }]
    })

    await expect(usersManager.validateAppPassword(localUser, 'pwd', '127.0.0.1', AUTH_SCOPE.WEBDAV)).resolves.toBe(false)
    expect(comparePassword).toHaveBeenCalledTimes(1)
    expect(comparePassword).toHaveBeenCalledWith('pwd', null)

    vi.mocked(comparePassword).mockClear()
    usersQueriesService.getUserSecrets = vi.fn().mockResolvedValue({
      appPasswords: [{ app: AUTH_SCOPE.WEBDAV, password: 'APP_HASH', expiration: new Date(0) }]
    })

    await expect(usersManager.validateAppPassword(localUser, 'pwd', '127.0.0.1', AUTH_SCOPE.WEBDAV)).resolves.toBe(false)
    expect(comparePassword).toHaveBeenCalledTimes(1)
    expect(comparePassword).toHaveBeenCalledWith('pwd', null)

    vi.mocked(comparePassword).mockClear()
    usersQueriesService.getUserSecrets = vi.fn().mockResolvedValue({
      appPasswords: [{ app: AUTH_SCOPE.WEBDAV, password: 'APP_HASH' }]
    })

    await expect(usersManager.validateAppPassword(localUser, 'pwd', '127.0.0.1', AUTH_SCOPE.WEBDAV)).resolves.toBe(false)
    expect(comparePassword).toHaveBeenCalledTimes(1)
    expect(comparePassword).toHaveBeenCalledWith('pwd', 'APP_HASH')
  })

  it('compareUserPassword + updateLanguage + updatePassword branches', async () => {
    usersQueriesService.compareUserPassword = vi.fn().mockResolvedValue(true)
    await expect(usersManager.compareUserPassword(1, 'p')).resolves.toBe(true)
    expect(usersQueriesService.compareUserPassword).toHaveBeenCalledWith(1, 'p')

    usersQueriesService.updateUserOrGuest = vi.fn().mockResolvedValue(false)
    await expect(usersManager.updateLanguage(userTest, { language: '' })).rejects.toThrow('Unable to update language')
    expect(usersQueriesService.updateUserOrGuest).toHaveBeenCalledWith(userTest.id, { language: null })
    usersQueriesService.updateUserOrGuest = vi.fn().mockResolvedValue(true)
    await expect(usersManager.updateLanguage(userTest, { language: 'fr' })).resolves.toBeUndefined()

    usersQueriesService.selectUserProperties = vi.fn().mockResolvedValue(null)
    await expect(usersManager.updatePassword(userTest, { oldPassword: 'a', newPassword: 'b' })).rejects.toThrow('Unable to check password')
    usersQueriesService.selectUserProperties = vi.fn().mockResolvedValue({ password: 'HASH' })
    vi.mocked(comparePassword).mockResolvedValue(false)
    await expect(usersManager.updatePassword(userTest, { oldPassword: 'a', newPassword: 'b' })).rejects.toThrow('Password mismatch')
    vi.mocked(comparePassword).mockResolvedValue(true)
    ;(bcrypt.hash as unknown as Mock).mockResolvedValue('HASHED')
    usersQueriesService.updateUserOrGuest = vi.fn().mockResolvedValue(true)
    await expect(usersManager.updatePassword(userTest, { oldPassword: 'a', newPassword: 'b' })).resolves.toBeUndefined()
    expect(usersQueriesService.updateUserOrGuest).toHaveBeenCalledWith(userTest.id, { password: 'HASHED' })
    usersQueriesService.updateUserOrGuest = vi.fn().mockResolvedValue(false)
    usersQueriesService.selectUserProperties = vi.fn().mockResolvedValue({ password: 'HASH' })
    vi.mocked(comparePassword).mockResolvedValue(true)
    ;(bcrypt.hash as unknown as Mock).mockResolvedValue('HASHED2')
    await expect(usersManager.updatePassword(userTest, { oldPassword: 'a', newPassword: 'b' })).rejects.toThrow('Unable to update password')
  })

  it('updateNotification + updateAccesses branches', async () => {
    usersQueriesService.updateUserOrGuest = vi.fn().mockResolvedValue(false)
    await expect(usersManager.updateNotification(userTest, { notification: 1 })).rejects.toThrow('Unable to update notification')
    usersQueriesService.updateUserOrGuest = vi.fn().mockResolvedValue(true)
    await expect(usersManager.updateNotification(userTest, { notification: 2 })).resolves.toBeUndefined()

    const u1 = new UserModel({ ...generateUserTest(), isActive: true, passwordAttempts: 3 } as any, false)
    usersQueriesService.updateAccesses = vi.fn().mockResolvedValue(true)
    await expect(usersManager.updateAccesses(u1, '5.6.7.8', true)).resolves.toBeUndefined()
    expect(usersQueriesService.updateAccesses).toHaveBeenCalledWith(u1.id, '5.6.7.8', 'reset')

    const u2 = new UserModel(
      {
        ...generateUserTest(),
        isActive: true,
        passwordAttempts: USER_MAX_PASSWORD_ATTEMPTS - 1
      } as any,
      false
    )
    usersQueriesService.updateAccesses = vi.fn().mockResolvedValue(true)
    await expect(usersManager.updateAccesses(u2, 'new.ip', false)).resolves.toBeUndefined()
    expect(usersQueriesService.updateAccesses).toHaveBeenCalledWith(u2.id, 'new.ip', 'increment')

    const u3 = new UserModel({ ...generateUserTest(), secrets: { twoFaSecret: 'secret' } } as any, false)
    await expect(usersManager.updateAccesses(u3, 'new.ip', true)).resolves.toBeUndefined()
    expect(usersQueriesService.updateAccesses).toHaveBeenCalledWith(u3.id, 'new.ip', 'preserve')
    await expect(usersManager.updateAccesses(u3, 'new.ip', false)).resolves.toBeUndefined()
    expect(usersQueriesService.updateAccesses).toHaveBeenCalledWith(u3.id, 'new.ip', 'increment')

    usersQueriesService.updateAccesses = vi.fn().mockResolvedValue(false)
    await expect(usersManager.updateAccesses(u1, 'new.ip', false)).rejects.toThrow('Unable to update user accesses')
  })

  it('should update password attempts atomically', async () => {
    const where = vi.fn().mockResolvedValue([{ affectedRows: 1 }])
    const set = vi.fn().mockReturnValue({ where })
    const update = vi.fn().mockReturnValue({ set })
    const usersQueries = new UsersQueries({ update } as any, {} as Cache)

    await expect(usersQueries.updateAccesses(userTest.id, '127.0.0.1', 'increment')).resolves.toBe(true)
    const increment = set.mock.calls[0][0]
    expect(increment.isActive).toBeInstanceOf(SQL)
    expect(increment.passwordAttempts).toBeInstanceOf(SQL)

    await expect(usersQueries.updateAccesses(userTest.id, '127.0.0.1', 'reset')).resolves.toBe(true)
    const reset = set.mock.calls[1][0]
    expect(reset.passwordAttempts).toBe(0)
    expect(reset.isActive).toBeUndefined()

    await expect(usersQueries.updateAccesses(userTest.id, '127.0.0.1', 'preserve')).resolves.toBe(true)
    const preserve = set.mock.calls[2][0]
    expect(preserve.passwordAttempts).toBeUndefined()
    expect(preserve.isActive).toBeUndefined()
  })

  it('avatars advanced: generateIsNotExists, failure branches, base64 fallback', async () => {
    await ensurePaths()
    usersManager.findUser = vi.fn().mockResolvedValue({ login: userTest.login, getInitials: () => 'UT' } as unknown as UserModel)
    const [p, m] = (await usersManager.getAvatar(userTest.login, false, true)) as [string, string]
    expect(fileName(p)).toBe('avatar.png')
    expect(m).toBe(pngMimeType)
    vi.spyOn(imageModule, 'generateAvatar').mockImplementation(() => errStream('gen error'))
    await expect(usersManager.getAvatar(userTest.login, true)).rejects.toThrow('Unable to create avatar')
    usersManager.findUser = vi.fn().mockResolvedValue(null)
    await expect(usersManager.getAvatar(userTest.login, true)).rejects.toThrow('avatar not found')
  })

  it('updateAvatar branches: mime error, stream error, truncated, invalid image, convert fail, success', async () => {
    await ensurePaths()
    const convertTempImageToPngMock = vi.mocked(imageModule.convertTempImageToPng)
    await expect(usersManager.updateAvatar(mkReq('text/plain', okStream('X')) as any)).rejects.toMatchObject({
      message: 'Unsupported file type',
      status: HttpStatus.BAD_REQUEST
    })
    await expect(usersManager.updateAvatar(mkReq('image/png', errStream('stream error')) as any)).rejects.toMatchObject({
      message: 'Unable to upload avatar',
      status: HttpStatus.INTERNAL_SERVER_ERROR
    })

    const t = okStream('OK')
    t.truncated = true
    await expect(usersManager.updateAvatar(mkReq('image/png', t) as any)).rejects.toMatchObject({
      message: 'Image is too large',
      status: HttpStatus.PAYLOAD_TOO_LARGE
    })
    expect(convertTempImageToPngMock).not.toHaveBeenCalled()

    convertTempImageToPngMock.mockRejectedValueOnce(new Error('Input buffer contains unsupported image format'))
    await expect(usersManager.updateAvatar(mkReq('image/png', okStream()) as any)).rejects.toMatchObject({
      message: 'Unable to convert or create avatar',
      status: HttpStatus.BAD_REQUEST
    })

    convertTempImageToPngMock.mockResolvedValueOnce(undefined)
    await expect(usersManager.updateAvatar(mkReq('image/png', okStream()) as any)).resolves.toBeUndefined()
    const expectedSrc = path.join(userTest.tmpPath, 'avatar.png')
    const expectedDst = path.join(userTest.homePath, 'avatar.png')
    expect(convertTempImageToPngMock).toHaveBeenLastCalledWith(expectedSrc, expectedDst)
  })

  it('setOnlineStatus + browseGroups + getGroup', async () => {
    usersQueriesService.setOnlineStatus = vi.fn().mockRejectedValue(new Error('boom'))
    expect(() => usersManager.setOnlineStatus({ id: 1 } as any, 1 as any)).not.toThrow()

    usersQueriesService.browseRootGroups = vi.fn().mockResolvedValue([{ id: 1 }])
    const root = await usersManager.browseGroups(userTest, '')
    expect(root.parentGroup).toBeUndefined()
    expect(root.members.length).toBe(1)
    usersQueriesService.groupFromName = vi.fn().mockResolvedValue(null)
    await expect(usersManager.browseGroups(userTest, 'unknown')).rejects.toThrow('Group not found')
    const group = { id: 42, name: 'Team' }
    usersQueriesService.groupFromName = vi.fn().mockResolvedValue(group)
    usersQueriesService.browseGroupMembers = vi.fn().mockResolvedValue([{ id: 7 }, { id: 8 }])
    const g2 = await usersManager.browseGroups(userTest, 'Team')
    expect(g2.parentGroup).toEqual(group)
    expect(g2.members).toEqual([{ id: 7 }, { id: 8 }])
    expect(usersQueriesService.browseGroupMembers).toHaveBeenCalledWith(42)

    usersQueriesService.getGroupWithMembers = vi.fn().mockResolvedValue({ id: 1, members: [] })
    await expect(usersManager.getGroup(userTest, 1)).resolves.toEqual({ id: 1, members: [] })
    usersQueriesService.getGroup = vi.fn().mockResolvedValue({ id: 2 })
    await expect(usersManager.getGroup(userTest, 2, false)).resolves.toEqual({ id: 2 })
    usersQueriesService.getGroup = vi.fn().mockResolvedValue(null)
    await expect(usersManager.getGroup(userTest, 3, false)).rejects.toThrow('You are not allowed to do this action')
  })

  it('create/update personal group', async () => {
    await expect(usersManager.createPersonalGroup(userTest, { name: '' } as any)).rejects.toThrow('Group name is missing')
    usersQueriesService.checkGroupNameExists = vi.fn().mockResolvedValue(true)
    await expect(usersManager.createPersonalGroup(userTest, { name: 'A' })).rejects.toThrow('Name already used')
    usersQueriesService.checkGroupNameExists = vi.fn().mockResolvedValue(false)
    usersQueriesService.createPersonalGroup = vi.fn().mockResolvedValue(10)
    usersQueriesService.clearWhiteListCaches = vi.fn()
    usersManager.getGroup = vi.fn().mockResolvedValue({ id: 10 })
    const logSpy = vi.spyOn((usersManager as any)['logger'], 'log').mockImplementation(() => undefined as any)
    await expect(usersManager.createPersonalGroup(userTest, { name: 'OK' })).resolves.toEqual({ id: 10 })
    expect(logSpy).toHaveBeenCalled()
    usersQueriesService.createPersonalGroup = vi.fn().mockRejectedValue(new Error('db down'))
    await expect(usersManager.createPersonalGroup(userTest, { name: 'OK' })).rejects.toThrow('Unable to create group')

    await expect(usersManager.updatePersonalGroup(userTest, 1, {} as any)).rejects.toThrow('No changes to update')
    usersManager.getGroup = vi.fn().mockResolvedValueOnce({ id: 1, type: MEMBER_TYPE.GROUP })
    await expect(usersManager.updatePersonalGroup(userTest, 1, { name: 'x' })).rejects.toThrow('You are not allowed to do this action')
    usersManager.getGroup = vi.fn().mockResolvedValue({ id: 1, type: MEMBER_TYPE.PGROUP })
    usersQueriesService.checkGroupNameExists = vi.fn().mockResolvedValue(true)
    await expect(usersManager.updatePersonalGroup(userTest, 1, { name: 'dup' })).rejects.toThrow('Name already used')
    usersQueriesService.checkGroupNameExists = vi.fn().mockResolvedValue(false)
    usersQueriesService.updateGroup = vi.fn().mockRejectedValue(new Error('oops'))
    await expect(usersManager.updatePersonalGroup(userTest, 1, { name: 'ok' })).rejects.toThrow('oops')
    usersQueriesService.updateGroup = vi.fn().mockResolvedValue(true)
    usersManager.getGroup = vi.fn().mockResolvedValue({ id: 1, type: MEMBER_TYPE.PGROUP })
    await expect(usersManager.updatePersonalGroup(userTest, 1, { name: 'ok' })).resolves.not.toThrow()
    expect(usersManager.getGroup).toHaveBeenCalledWith(userTest, 1, false, userTest.isAdmin)
  })

  it('addUsersToGroup (GROUP/PGROUP)', async () => {
    usersManager.getGroup = vi.fn().mockResolvedValue({ id: 1, type: MEMBER_TYPE.GROUP, members: [{ id: 2 }, { id: 3 }] })
    usersQueriesService.usersWhitelist = vi.fn().mockResolvedValue([3, 4, 5])
    await expect(usersManager.addUsersToGroup(userTest, 1, [2, 3])).rejects.toThrow('No users to add to group')
    usersQueriesService.updateGroupMembers = vi.fn().mockResolvedValue(undefined)
    await expect(usersManager.addUsersToGroup(userTest, 1, [3, 4, 5])).resolves.toBeUndefined()
    expect(usersQueriesService.updateGroupMembers).toHaveBeenCalledWith(1, {
      add: [
        { id: 4, groupRole: USER_GROUP_ROLE.MEMBER },
        { id: 5, groupRole: USER_GROUP_ROLE.MEMBER }
      ]
    })
    expect(usersQueriesService.usersWhitelist).toHaveBeenCalledWith(userTest.id, USER_ROLE.USER)

    usersManager.getGroup = vi.fn().mockResolvedValue({ id: 2, type: MEMBER_TYPE.PGROUP, members: [] })
    usersQueriesService.usersWhitelist = vi.fn().mockResolvedValue([10, 11])
    usersQueriesService.updateGroupMembers = vi.fn().mockResolvedValue(undefined)
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
    usersManager.getGroup = vi.fn().mockResolvedValue({ id: 1, type: MEMBER_TYPE.GROUP, members: [] })
    await expect(usersManager.updateUserFromPersonalGroup(userTest, 1, 9, { role: 1 })).rejects.toThrow('You are not allowed to do this action')
    usersManager.getGroup = vi.fn().mockResolvedValue({ id: 1, type: MEMBER_TYPE.PGROUP, members: [] })
    await expect(usersManager.updateUserFromPersonalGroup(userTest, 1, 9, { role: 1 })).rejects.toThrow('User was not found')
    usersManager.getGroup = vi.fn().mockResolvedValue({
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
    const spy = vi.spyOn(adminUsersManager, 'updateUserFromGroup').mockResolvedValue(undefined)
    usersManager.getGroup = vi.fn().mockResolvedValue({
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
    usersManager.getGroup = vi.fn().mockResolvedValue({ id: 1, type: MEMBER_TYPE.PGROUP, members: [{ id: 9, groupRole: USER_GROUP_ROLE.MEMBER }] })
    await expect(usersManager.updateUserFromPersonalGroup(userTest, 1, 9, { role: USER_GROUP_ROLE.MEMBER })).resolves.toBeUndefined()
    vi.mocked(spy).mockClear()
    usersManager.getGroup = vi.fn().mockResolvedValue({
      id: 1,
      type: MEMBER_TYPE.PGROUP,
      members: [
        { id: 9, groupRole: USER_GROUP_ROLE.MANAGER },
        { id: 10, groupRole: USER_GROUP_ROLE.MANAGER }
      ]
    })
    await expect(usersManager.updateUserFromPersonalGroup(userTest, 1, 9, { role: USER_GROUP_ROLE.MEMBER })).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalledWith(1, 9, { role: USER_GROUP_ROLE.MEMBER })
    vi.mocked(spy).mockClear()
    usersManager.getGroup = vi.fn().mockResolvedValue({
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
    usersManager.getGroup = vi.fn().mockResolvedValue({ id: 1, members: [] })
    await expect(usersManager.removeUserFromGroup(userTest, 1, 9)).rejects.toThrow('User was not found')
    usersManager.getGroup = vi.fn().mockResolvedValue({ id: 1, type: MEMBER_TYPE.GROUP, members: [{ id: 9, groupRole: USER_GROUP_ROLE.MANAGER }] })
    await expect(usersManager.removeUserFromGroup(userTest, 1, 9)).rejects.toThrow('You are not allowed to do this action')
    usersManager.getGroup = vi.fn().mockResolvedValue({ id: 1, type: MEMBER_TYPE.PGROUP, members: [{ id: 9, groupRole: USER_GROUP_ROLE.MANAGER }] })
    await expect(usersManager.removeUserFromGroup(userTest, 1, 9)).rejects.toThrow('Group must have at least one manager')
    usersQueriesService.updateGroupMembers = vi.fn().mockResolvedValue(undefined)
    usersManager.getGroup = vi.fn().mockResolvedValue({
      id: 1,
      type: MEMBER_TYPE.PGROUP,
      members: [
        { id: 9, groupRole: USER_GROUP_ROLE.MEMBER },
        { id: 10, groupRole: USER_GROUP_ROLE.MANAGER }
      ]
    })
    await expect(usersManager.removeUserFromGroup(userTest, 1, 9)).resolves.toBeUndefined()
    expect(usersQueriesService.updateGroupMembers).toHaveBeenCalledWith(1, { remove: [9] })
    usersQueriesService.updateGroupMembers = vi.fn().mockResolvedValue(undefined)
    usersManager.getGroup = vi.fn().mockResolvedValue({
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
    usersQueriesService.getGroupWithMembers = vi.fn().mockResolvedValue(null)
    await expect(usersManager.leavePersonalGroup(userTest, 1)).rejects.toThrow('You are not allowed to do this action')
    usersQueriesService.getGroupWithMembers = vi.fn().mockResolvedValue({ id: 1, type: MEMBER_TYPE.GROUP, members: [{ id: userTest.id }] })
    await expect(usersManager.leavePersonalGroup(userTest, 1)).rejects.toThrow('You are not allowed to do this action')
    usersQueriesService.getGroupWithMembers = vi.fn().mockResolvedValue({ id: 1, type: MEMBER_TYPE.PGROUP, members: [] })
    await expect(usersManager.leavePersonalGroup(userTest, 1)).rejects.toThrow('User was not found')
    usersQueriesService.getGroupWithMembers = vi.fn().mockResolvedValue({
      id: 1,
      type: MEMBER_TYPE.PGROUP,
      members: [{ id: userTest.id, groupRole: USER_GROUP_ROLE.MANAGER }]
    })
    await expect(usersManager.leavePersonalGroup(userTest, 1)).rejects.toThrow('Group must have at least one manager')
    usersQueriesService.getGroupWithMembers = vi.fn().mockResolvedValue({
      id: 1,
      type: 2,
      members: [
        { id: userTest.id, groupRole: USER_GROUP_ROLE.MEMBER },
        { id: 9, groupRole: USER_GROUP_ROLE.MANAGER }
      ]
    })
    const lSpy = vi.spyOn((usersManager as any)['logger'], 'log').mockImplementation(() => undefined as any)
    usersQueriesService.updateGroupMembers = vi.fn().mockResolvedValue(undefined)
    await expect(usersManager.leavePersonalGroup(userTest, 1)).resolves.toBeUndefined()
    expect(lSpy).toHaveBeenCalledWith(expect.objectContaining({ msg: expect.stringMatching(/has left group/) }))
    usersQueriesService.updateGroupMembers = vi.fn().mockRejectedValue(new Error('DB'))
    await expect(usersManager.leavePersonalGroup(userTest, 1)).rejects.toThrow('DB')
    usersQueriesService.getGroupWithMembers = vi.fn().mockResolvedValue({
      id: 1,
      type: MEMBER_TYPE.PGROUP,
      members: [
        { id: userTest.id, groupRole: USER_GROUP_ROLE.MANAGER },
        { id: 9, groupRole: USER_GROUP_ROLE.MANAGER }
      ]
    })
    usersQueriesService.updateGroupMembers = vi.fn().mockResolvedValue(undefined)
    await expect(usersManager.leavePersonalGroup(userTest, 1)).resolves.toBeUndefined()

    usersQueriesService.canDeletePersonalGroup = vi.fn().mockResolvedValue(false)
    await expect(usersManager.deletePersonalGroup(userTest, 7)).rejects.toThrow('You are not allowed to do this action')
    usersQueriesService.canDeletePersonalGroup = vi.fn().mockResolvedValue(true)
    const wSpy = vi.spyOn((usersManager as any)['logger'], 'warn').mockImplementation(() => undefined as any)
    usersQueriesService.deletePersonalGroup = vi.fn().mockResolvedValue(false)
    await expect(usersManager.deletePersonalGroup(userTest, 7)).rejects.toThrow('Unable to delete group')
    expect(wSpy).toHaveBeenCalledWith(expect.objectContaining({ msg: expect.stringMatching(/does not exist/) }))
    const lgSpy = vi.spyOn((usersManager as any)['logger'], 'log').mockImplementation(() => undefined as any)
    usersQueriesService.deletePersonalGroup = vi.fn().mockResolvedValue(true)
    await expect(usersManager.deletePersonalGroup(userTest, 7)).resolves.toBeUndefined()
    expect(lgSpy).toHaveBeenCalledWith(expect.objectContaining({ msg: expect.stringMatching(/was deleted/) }))
  })

  it('guests list + get', async () => {
    usersQueriesService.listGuests = vi.fn().mockResolvedValue([{ id: 1 }])
    await expect(usersManager.listGuests(userTest)).resolves.toEqual([{ id: 1 }])

    const checkSpy = vi.spyOn(adminUsersManager, 'checkUser').mockImplementation(() => undefined)
    usersQueriesService.listGuests = vi.fn().mockResolvedValue({ id: 9 })
    await expect(usersManager.getGuest(userTest, 9)).resolves.toEqual({ id: 9 })
    expect(checkSpy).toHaveBeenCalled()
  })

  it('createGuest adds current user as manager only once', async () => {
    usersQueriesService.usersWhitelist = vi.fn().mockResolvedValue([userTest.id, 100])
    const createSpy = vi.spyOn(adminUsersManager, 'createUserOrGuest').mockResolvedValue({ id: 55 } as any)

    const dto1: CreateUserDto = { ...userTest, managers: [100], password: 'x' }
    const r = await usersManager.createGuest(userTest, dto1)
    expect(createSpy).toHaveBeenCalled()
    expect(r).toEqual({ id: 55 })
    const args1 = vi.mocked(createSpy).mock.calls[0][0]
    expect(args1.managers).toEqual(expect.arrayContaining([userTest.id]))
    vi.mocked(createSpy).mockClear()
    const dto2: CreateUserDto = { ...userTest, managers: [userTest.id, 100], password: 'y' }
    await usersManager.createGuest(userTest, dto2)
    const args2 = vi.mocked(createSpy).mock.calls[0][0]
    expect((args2.managers as number[]).filter((m: number) => m === userTest.id)).toHaveLength(1)
  })

  it('createGuest groups filtering keeps only allowed groups and logs warning', async () => {
    const warnSpy = vi.spyOn((usersManager as any)['logger'], 'warn').mockImplementation(() => undefined as any)
    usersQueriesService.usersWhitelist = vi.fn().mockResolvedValue([userTest.id, 100])
    usersQueriesService.groupsWhitelist = vi.fn().mockResolvedValue([10])
    const createSpy = vi.spyOn(adminUsersManager, 'createUserOrGuest').mockResolvedValue({ id: 55 } as any)

    const dto: CreateUserDto = { ...userTest, managers: [100], groups: [10, 11], password: 'x' }
    await expect(usersManager.createGuest(userTest, dto)).resolves.toEqual({ id: 55 })
    expect(usersQueriesService.groupsWhitelist).toHaveBeenCalledWith(userTest.id, GROUP_TYPE.PERSONAL, USER_GROUP_ROLE.MANAGER)
    const args = vi.mocked(createSpy).mock.calls[0][0]
    expect(args.groups).toEqual([10])
    expect(warnSpy).toHaveBeenCalledWith(expect.objectContaining({ msg: 'Some groups were not allowed' }))
  })

  it('createGuest groups keeps all allowed groups without warning', async () => {
    const warnSpy = vi.spyOn((usersManager as any)['logger'], 'warn').mockImplementation(() => undefined as any)
    usersQueriesService.usersWhitelist = vi.fn().mockResolvedValue([userTest.id, 100])
    usersQueriesService.groupsWhitelist = vi.fn().mockResolvedValue([10, 11])
    const createSpy = vi.spyOn(adminUsersManager, 'createUserOrGuest').mockResolvedValue({ id: 55 } as any)

    const dto: CreateUserDto = { ...userTest, managers: [100], groups: [10, 11], password: 'x' }
    await expect(usersManager.createGuest(userTest, dto)).resolves.toEqual({ id: 55 })
    expect(usersQueriesService.groupsWhitelist).toHaveBeenCalledWith(userTest.id, GROUP_TYPE.PERSONAL, USER_GROUP_ROLE.MANAGER)
    const args = vi.mocked(createSpy).mock.calls[0][0]
    expect(args.groups).toEqual([10, 11])
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('updateGuest checks ownership and manager whitelist', async () => {
    await expect(usersManager.updateGuest(userTest, 9, {} as any)).rejects.toThrow('No changes to update')
    usersQueriesService.usersWhitelist = vi.fn().mockResolvedValue([1])
    usersQueriesService.isGuestManager = vi.fn().mockResolvedValue(true)
    await expect(usersManager.updateGuest(userTest, 9, { managers: [2] } as any)).rejects.toThrow('Guest must have at least one manager')
    usersQueriesService.isGuestManager = vi.fn().mockResolvedValue(false)
    await expect(usersManager.updateGuest(userTest, 9, { email: 'a' } as any)).rejects.toThrow('You are not allowed to do this action')
    usersQueriesService.isGuestManager = vi.fn().mockResolvedValue(true)
    vi.spyOn(adminUsersManager, 'updateUserOrGuest').mockResolvedValue({ managers: [{ id: 999 }] } as any)
    await expect(usersManager.updateGuest(userTest, 9, { email: 'a' } as any)).resolves.toBeNull()
    vi.spyOn(adminUsersManager, 'updateUserOrGuest').mockResolvedValue({ managers: [{ id: userTest.id }] } as any)
    await expect(usersManager.updateGuest(userTest, 9, { email: 'a' } as any)).resolves.toEqual({ managers: [{ id: userTest.id }] })
    usersQueriesService.usersWhitelist = vi.fn().mockResolvedValue([userTest.id, 77])
    usersQueriesService.isGuestManager = vi.fn().mockResolvedValue(true)
    vi.spyOn(adminUsersManager, 'updateUserOrGuest').mockResolvedValue({ managers: [{ id: userTest.id }, { id: 77 }] } as any)
    await expect(usersManager.updateGuest(userTest, 9, { managers: [userTest.id, 77] } as any)).resolves.toEqual({
      managers: [{ id: userTest.id }, { id: 77 }]
    })
  })

  it('updateGuest groups forbidden when current user is not manager', async () => {
    const updateSpy = vi.spyOn(adminUsersManager, 'updateUserOrGuest')
    usersQueriesService.isGuestManager = vi.fn().mockResolvedValue(false)
    usersQueriesService.groupsWhitelist = vi.fn()
    await expect(usersManager.updateGuest(userTest, 9, { groups: [10] } as any)).rejects.toThrow('You are not allowed to do this action')
    expect(usersQueriesService.groupsWhitelist).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('updateGuest groups filtering logs warning when some groups are rejected', async () => {
    const warnSpy = vi.spyOn((usersManager as any)['logger'], 'warn').mockImplementation(() => undefined as any)
    const updateSpy = vi.spyOn(adminUsersManager, 'updateUserOrGuest')
    usersQueriesService.isGuestManager = vi.fn().mockResolvedValue(true)
    usersQueriesService.groupsWhitelist = vi.fn().mockResolvedValue([10])
    updateSpy.mockResolvedValue({ managers: [{ id: userTest.id }], groups: [{ id: 10 }] } as any)

    await expect(usersManager.updateGuest(userTest, 9, { groups: [10, 11] } as any)).resolves.toEqual({
      managers: [{ id: userTest.id }],
      groups: [{ id: 10 }]
    })
    expect(usersQueriesService.groupsWhitelist).toHaveBeenCalledWith(userTest.id, GROUP_TYPE.PERSONAL, USER_GROUP_ROLE.MANAGER)
    expect(updateSpy).toHaveBeenLastCalledWith(9, { groups: [10] }, USER_ROLE.GUEST)
    expect(warnSpy).toHaveBeenCalledWith(expect.objectContaining({ msg: 'Some groups were not allowed' }))
  })

  it('updateGuest groups does not log warning when all groups are allowed', async () => {
    const warnSpy = vi.spyOn((usersManager as any)['logger'], 'warn').mockImplementation(() => undefined as any)
    const updateSpy = vi.spyOn(adminUsersManager, 'updateUserOrGuest')
    usersQueriesService.isGuestManager = vi.fn().mockResolvedValue(true)
    usersQueriesService.groupsWhitelist = vi.fn().mockResolvedValue([10, 11])
    updateSpy.mockResolvedValue({ managers: [{ id: userTest.id }], groups: [{ id: 10 }, { id: 11 }] } as any)

    await expect(usersManager.updateGuest(userTest, 9, { groups: [10, 11] } as any)).resolves.toEqual({
      managers: [{ id: userTest.id }],
      groups: [{ id: 10 }, { id: 11 }]
    })
    expect(updateSpy).toHaveBeenLastCalledWith(9, { groups: [10, 11] }, USER_ROLE.GUEST)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('deleteGuest checks ownership then deletes guest', async () => {
    usersQueriesService.isGuestManager = vi.fn().mockResolvedValue(null)
    await expect(usersManager.deleteGuest(userTest, 9)).rejects.toThrow('You are not allowed to do this action')
    usersQueriesService.isGuestManager = vi.fn().mockResolvedValue({ id: 9, login: 'guest' })
    const delSpy = vi.spyOn(adminUsersManager, 'deleteUserOrGuest').mockResolvedValue(undefined)
    await expect(usersManager.deleteGuest(userTest, 9)).resolves.toBeUndefined()
    expect(delSpy).toHaveBeenCalledWith(9, 'guest', { deleteSpace: true, isGuest: true })
  })

  it('proxies forward search + online + whitelist', async () => {
    usersQueriesService.searchUsersOrGroups = vi.fn().mockResolvedValue([{ id: 1 }])
    await expect(usersManager.searchMembers(userTest, { search: '' } as any)).resolves.toEqual([{ id: 1 }])

    usersQueriesService.getOnlineUsers = vi.fn().mockResolvedValue([{ id: 123 }])
    await expect(usersManager.getOnlineUsers([123])).resolves.toEqual([{ id: 123 }])
    expect(usersQueriesService.getOnlineUsers).toHaveBeenCalledWith([123])
    usersQueriesService.usersWhitelist = vi.fn().mockResolvedValue([10, 11])
    await expect(usersManager.usersWhitelist(userTest.id)).resolves.toEqual([10, 11])
    expect(usersQueriesService.usersWhitelist).toHaveBeenCalledWith(userTest.id)
  })
})
