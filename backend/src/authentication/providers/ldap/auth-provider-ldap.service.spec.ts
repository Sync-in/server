import { Test, TestingModule } from '@nestjs/testing'
import { Mocked } from 'jest-mock'
import { Client, InvalidCredentialsError } from 'ldapts'
import { CONNECT_ERROR_CODE } from '../../../app.constants'
import { USER_PERMISSION, USER_ROLE } from '../../../applications/users/constants/user'
import { UserModel } from '../../../applications/users/models/user.model'
import { AdminUsersManager } from '../../../applications/users/services/admin-users-manager.service'
import { UsersManager } from '../../../applications/users/services/users-manager.service'
import * as commonFunctions from '../../../common/functions'
import { configuration } from '../../../configuration/config.environment'
import type { AuthProviderLDAPConfig } from './auth-ldap.config'
import { LDAP_COMMON_ATTR, LDAP_LOGIN_ATTR } from './auth-ldap.constants'
import { AuthProviderLDAP } from './auth-provider-ldap.service'

jest.mock('ldapts', () => {
  const actual = jest.requireActual('ldapts')
  const mockClientInstance = {
    bind: jest.fn(),
    search: jest.fn(),
    unbind: jest.fn()
  }
  const Client = jest.fn().mockImplementation(() => mockClientInstance)
  return { ...actual, Client }
})

const buildUser = (overrides: Partial<UserModel> = {}) =>
  ({
    id: 0,
    login: 'john',
    email: 'old@example.org',
    password: 'hashed',
    role: USER_ROLE.USER,
    isGuest: false,
    isActive: true,
    isAdmin: false,
    makePaths: jest.fn().mockResolvedValue(undefined),
    setFullName: jest.fn(),
    ...overrides
  }) as any

const ldapClient = {
  bind: jest.fn(),
  search: jest.fn(),
  unbind: jest.fn()
}
;(Client as Mocked<any>).mockImplementation(() => ldapClient)

describe(AuthProviderLDAP.name, () => {
  let authProviderLDAP: AuthProviderLDAP
  let usersManager: Mocked<UsersManager>
  let adminUsersManager: Mocked<AdminUsersManager>

  type LdapConfigOverrides = Omit<Partial<AuthProviderLDAPConfig>, 'attributes' | 'options'> & {
    attributes?: Partial<AuthProviderLDAPConfig['attributes']>
    options?: Partial<AuthProviderLDAPConfig['options']>
  }

  const setLdapConfig = (overrides: LdapConfigOverrides = {}) => {
    const base: AuthProviderLDAPConfig = {
      servers: ['ldap://localhost:389'],
      attributes: { login: LDAP_LOGIN_ATTR.UID, email: LDAP_COMMON_ATTR.MAIL },
      baseDN: 'ou=people,dc=example,dc=org',
      filter: '',
      options: {
        autoCreateUser: true,
        autoCreatePermissions: [],
        enablePasswordAuthFallback: true
      }
    }
    const next: AuthProviderLDAPConfig = {
      ...base,
      ...overrides,
      attributes: { ...base.attributes, ...(overrides.attributes || {}) },
      options: { ...base.options, ...(overrides.options || {}) }
    }
    configuration.auth.ldap = next
    ;(authProviderLDAP as any).ldapConfig = next
    ;(authProviderLDAP as any).isAD = [LDAP_LOGIN_ATTR.SAM, LDAP_LOGIN_ATTR.UPN].includes(next.attributes.login)
    ;(authProviderLDAP as any).hasServiceBind = Boolean(next.serviceBindDN && next.serviceBindPassword)
  }

  const mockBindResolve = () => {
    ldapClient.bind.mockResolvedValue(undefined)
    ldapClient.unbind.mockResolvedValue(undefined)
  }

  const mockBindRejectInvalid = (message = 'invalid') => {
    ldapClient.bind.mockRejectedValue(new InvalidCredentialsError(message))
    ldapClient.unbind.mockResolvedValue(undefined)
  }

  const mockSearchEntries = (entries: any[]) => {
    ldapClient.search.mockResolvedValue({ searchEntries: entries })
  }

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthProviderLDAP,
        {
          provide: UsersManager,
          useValue: {
            findUser: jest.fn(),
            logUser: jest.fn(),
            updateAccesses: jest.fn().mockResolvedValue(undefined),
            validateAppPassword: jest.fn(),
            fromUserId: jest.fn()
          }
        },
        {
          provide: AdminUsersManager,
          useValue: {
            createUserOrGuest: jest.fn(),
            updateUserOrGuest: jest.fn()
          }
        }
      ]
    }).compile()

    module.useLogger(['fatal'])
    authProviderLDAP = module.get<AuthProviderLDAP>(AuthProviderLDAP)
    adminUsersManager = module.get<Mocked<AdminUsersManager>>(AdminUsersManager)
    usersManager = module.get<Mocked<UsersManager>>(UsersManager)
  })

  beforeEach(() => {
    jest.clearAllMocks()
    setLdapConfig()
    usersManager.updateAccesses.mockResolvedValue(undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('should be defined', () => {
    expect(authProviderLDAP).toBeDefined()
    expect(usersManager).toBeDefined()
    expect(adminUsersManager).toBeDefined()
    expect(ldapClient).toBeDefined()
  })

  it('should authenticate a guest user via database and bypass LDAP', async () => {
    const guestUser: any = { id: 1, login: 'guest1', isGuest: true, isActive: true }
    usersManager.findUser.mockResolvedValue(guestUser)
    const dbAuthResult: any = { ...guestUser, token: 'jwt' }
    usersManager.logUser.mockResolvedValue(dbAuthResult)

    const res = await authProviderLDAP.validateUser('guest1', 'pass', '127.0.0.1')

    expect(res).toEqual(dbAuthResult)
    expect(usersManager.logUser).toHaveBeenCalledWith(guestUser, 'pass', '127.0.0.1', undefined)
    expect(Client).not.toHaveBeenCalled()
  })

  it('should bypass LDAP when scope is provided', async () => {
    const user = buildUser({ id: 12 })
    usersManager.findUser.mockResolvedValue(user)
    usersManager.logUser.mockResolvedValue(user)

    const res = await authProviderLDAP.validateUser('john', 'app-password', '10.0.0.2', 'webdav' as any)

    expect(res).toBe(user)
    expect(usersManager.logUser).toHaveBeenCalledWith(user, 'app-password', '10.0.0.2', 'webdav')
    expect(Client).not.toHaveBeenCalled()
  })

  it('should throw FORBIDDEN for locked account', async () => {
    usersManager.findUser.mockResolvedValue({ login: 'john', isGuest: false, isActive: false } as UserModel)
    const loggerErrorSpy = jest.spyOn(authProviderLDAP['logger'], 'error').mockImplementation(() => undefined as any)

    await expect(authProviderLDAP.validateUser('john', 'pwd')).rejects.toThrow(/account locked/i)
    expect(loggerErrorSpy).toHaveBeenCalled()
  })

  it('should return null on invalid LDAP credentials without fallback', async () => {
    const existingUser: any = buildUser({ id: 1 })
    usersManager.findUser.mockResolvedValue(existingUser)
    mockBindRejectInvalid('invalid credentials')

    const res = await authProviderLDAP.validateUser('john', 'badpwd', '10.0.0.1')

    expect(res).toBeNull()
    expect(usersManager.logUser).not.toHaveBeenCalled()
    expect(usersManager.updateAccesses).not.toHaveBeenCalled()
  })

  it('should return null when LDAP search yields no entries or throws', async () => {
    const existingUser: any = buildUser({ id: 10 })
    usersManager.findUser.mockResolvedValue(existingUser)
    mockBindResolve()
    mockSearchEntries([])

    const resA = await authProviderLDAP.validateUser('john', 'pwd')

    expect(resA).toBeNull()

    ldapClient.search.mockRejectedValue(new Error('search failed'))
    const resB = await authProviderLDAP.validateUser('john', 'pwd')

    expect(resB).toBeNull()
    expect(usersManager.updateAccesses).not.toHaveBeenCalled()
  })

  it('should fallback to local auth when LDAP is unavailable and fallback is enabled', async () => {
    const existingUser: any = buildUser({ id: 2 })
    usersManager.findUser.mockResolvedValue(existingUser)
    usersManager.logUser.mockResolvedValue(existingUser)
    const err = Object.assign(new Error('connect ECONNREFUSED'), { code: Array.from(CONNECT_ERROR_CODE)[0] })
    ldapClient.bind.mockRejectedValue({ errors: [err] })
    ldapClient.unbind.mockResolvedValue(undefined)

    const res = await authProviderLDAP.validateUser('john', 'pwd', '10.0.0.3')

    expect(res).toBe(existingUser)
    expect(usersManager.logUser).toHaveBeenCalledWith(existingUser, 'pwd', '10.0.0.3')
  })

  it('should throw SERVICE_UNAVAILABLE when LDAP is unavailable and fallback is disabled', async () => {
    setLdapConfig({ options: { enablePasswordAuthFallback: false } })
    const existingUser: any = buildUser({ id: 3 })
    usersManager.findUser.mockResolvedValue(existingUser)
    const err = Object.assign(new Error('connect ECONNREFUSED'), { code: Array.from(CONNECT_ERROR_CODE)[0] })
    ldapClient.bind.mockRejectedValue({ errors: [err] })
    ldapClient.unbind.mockResolvedValue(undefined)

    await expect(authProviderLDAP.validateUser('john', 'pwd')).rejects.toThrow(/authentication service error/i)
  })

  it('should allow admin local fallback when LDAP is unavailable even if fallback is disabled', async () => {
    setLdapConfig({ options: { enablePasswordAuthFallback: false } })
    const existingUser: any = buildUser({ id: 4, isAdmin: true })
    usersManager.findUser.mockResolvedValue(existingUser)
    usersManager.logUser.mockResolvedValue(existingUser)
    const err = Object.assign(new Error('connect ECONNREFUSED'), { code: Array.from(CONNECT_ERROR_CODE)[0] })
    ldapClient.bind.mockRejectedValue({ errors: [err] })
    ldapClient.unbind.mockResolvedValue(undefined)

    const res = await authProviderLDAP.validateUser('john', 'pwd')

    expect(res).toBe(existingUser)
    expect(usersManager.logUser).toHaveBeenCalledWith(existingUser, 'pwd', undefined)
  })

  it('should return null when LDAP entry lacks required fields', async () => {
    usersManager.findUser.mockResolvedValue(null)
    mockBindResolve()
    mockSearchEntries([{ uid: 'jane', cn: 'Jane Doe', mail: undefined }])
    const loggerErrorSpy = jest.spyOn(authProviderLDAP['logger'], 'error').mockImplementation(() => undefined as any)

    const res = await authProviderLDAP.validateUser('jane', 'pwd')

    expect(res).toBeNull()
    expect(adminUsersManager.createUserOrGuest).not.toHaveBeenCalled()
    expect(loggerErrorSpy).toHaveBeenCalled()
  })

  it('should throw UNAUTHORIZED when autoCreateUser is disabled', async () => {
    setLdapConfig({ options: { autoCreateUser: false } })
    usersManager.findUser.mockResolvedValue(null)
    const checkAuthSpy = jest.spyOn<any, any>(authProviderLDAP as any, 'checkAuth').mockResolvedValue({
      uid: 'john',
      mail: 'john@example.org'
    })

    await expect(authProviderLDAP.validateUser('john', 'pwd')).rejects.toThrow(/user not found/i)
    checkAuthSpy.mockRestore()
  })

  it('should create a new admin user with permissions and name parsed from LDAP', async () => {
    setLdapConfig({
      options: {
        adminGroup: 'Admins',
        autoCreatePermissions: [USER_PERMISSION.PERSONAL_SPACE, USER_PERMISSION.WEBDAV]
      }
    })
    usersManager.findUser.mockResolvedValue(null)
    mockBindResolve()
    mockSearchEntries([
      {
        uid: 'john',
        givenName: 'John',
        sn: 'Doe',
        mail: 'john@example.org',
        memberOf: ['CN=Admins,OU=Groups,DC=example,DC=org']
      }
    ])
    const createdUser: any = { id: 2, login: 'john', isGuest: false, isActive: true, makePaths: jest.fn() }
    adminUsersManager.createUserOrGuest.mockResolvedValue(createdUser)
    usersManager.fromUserId.mockResolvedValue(createdUser)

    const res = await authProviderLDAP.validateUser('john', 'pwd', '192.168.1.10')

    expect(adminUsersManager.createUserOrGuest).toHaveBeenCalledWith(
      {
        login: 'john',
        email: 'john@example.org',
        password: 'pwd',
        role: USER_ROLE.ADMINISTRATOR,
        firstName: 'John',
        lastName: 'Doe',
        permissions: 'personal_space,webdav_access'
      },
      USER_ROLE.ADMINISTRATOR
    )
    expect(res).toBe(createdUser)
    expect(usersManager.updateAccesses).toHaveBeenCalledWith(createdUser, '192.168.1.10', true)
  })

  it('should accept adminGroup as full DN', async () => {
    setLdapConfig({
      options: {
        adminGroup: 'CN=Admins,OU=Groups,DC=example,DC=org'
      }
    })
    usersManager.findUser.mockResolvedValue(null)
    mockBindResolve()
    mockSearchEntries([
      {
        uid: 'john',
        givenName: 'John',
        sn: 'Doe',
        mail: 'john@example.org',
        memberOf: ['CN=Admins,OU=Groups,DC=example,DC=org']
      }
    ])
    const createdUser: any = { id: 9, login: 'john', isGuest: false, isActive: true, makePaths: jest.fn() }
    adminUsersManager.createUserOrGuest.mockResolvedValue(createdUser)
    usersManager.fromUserId.mockResolvedValue(createdUser)

    const res = await authProviderLDAP.validateUser('john', 'pwd')

    expect(adminUsersManager.createUserOrGuest).toHaveBeenCalledWith(
      expect.objectContaining({ role: USER_ROLE.ADMINISTRATOR }),
      USER_ROLE.ADMINISTRATOR
    )
    expect(res).toBe(createdUser)
  })

  it('should use groupOfNames to detect admin membership when memberOf is missing', async () => {
    setLdapConfig({ options: { adminGroup: 'Admins' } })
    usersManager.findUser.mockResolvedValue(null)
    mockBindResolve()
    ldapClient.search
      .mockResolvedValueOnce({
        searchEntries: [
          {
            uid: 'john',
            cn: 'John Doe',
            mail: 'john@example.org',
            dn: 'uid=john,ou=people,dc=example,dc=org'
          }
        ]
      })
      .mockResolvedValueOnce({ searchEntries: [{ cn: 'Admins' }] })
    const createdUser: any = { id: 3, login: 'john', isGuest: false, isActive: true, makePaths: jest.fn() }
    adminUsersManager.createUserOrGuest.mockResolvedValue(createdUser)
    usersManager.fromUserId.mockResolvedValue(createdUser)

    const res = await authProviderLDAP.validateUser('john', 'pwd')

    expect(adminUsersManager.createUserOrGuest).toHaveBeenCalledWith(
      expect.objectContaining({ role: USER_ROLE.ADMINISTRATOR }),
      USER_ROLE.ADMINISTRATOR
    )
    expect(res).toBe(createdUser)
  })

  it('should use service bind for LDAP searches when configured', async () => {
    setLdapConfig({
      serviceBindDN: 'cn=svc,dc=example,dc=org',
      serviceBindPassword: 'secret'
    })
    usersManager.findUser.mockResolvedValue(null)
    mockBindResolve()
    ldapClient.search.mockResolvedValueOnce({
      searchEntries: [{ uid: 'john', cn: 'John Doe', mail: 'john@example.org', dn: 'uid=john,ou=people,dc=example,dc=org' }]
    })
    const createdUser: any = { id: 8, login: 'john', isGuest: false, isActive: true, makePaths: jest.fn() }
    adminUsersManager.createUserOrGuest.mockResolvedValue(createdUser)
    usersManager.fromUserId.mockResolvedValue(createdUser)

    await authProviderLDAP.validateUser('john', 'pwd')

    expect(ldapClient.bind).toHaveBeenCalledWith('cn=svc,dc=example,dc=org', 'secret')
    expect(ldapClient.bind).toHaveBeenCalledWith('uid=john,ou=people,dc=example,dc=org', 'pwd')
  })

  it('should return null when service bind is set but user DN is not found', async () => {
    setLdapConfig({
      serviceBindDN: 'cn=svc,dc=example,dc=org',
      serviceBindPassword: 'secret'
    })
    usersManager.findUser.mockResolvedValue(null)
    mockBindResolve()
    ldapClient.search.mockResolvedValueOnce({ searchEntries: [] })

    const res = await authProviderLDAP.validateUser('john', 'pwd')

    expect(res).toBeNull()
    expect(ldapClient.bind).toHaveBeenCalledWith('cn=svc,dc=example,dc=org', 'secret')
    expect(ldapClient.bind).not.toHaveBeenCalledWith('uid=john,ou=people,dc=example,dc=org', 'pwd')
  })

  it('should return null when user bind fails after service bind', async () => {
    setLdapConfig({
      serviceBindDN: 'cn=svc,dc=example,dc=org',
      serviceBindPassword: 'secret'
    })
    usersManager.findUser.mockResolvedValue(null)
    ldapClient.unbind.mockResolvedValue(undefined)
    ldapClient.bind.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new InvalidCredentialsError('invalid credentials'))
    ldapClient.search.mockResolvedValueOnce({
      searchEntries: [{ dn: 'uid=john,ou=people,dc=example,dc=org', cn: 'John Doe' }]
    })

    const res = await authProviderLDAP.validateUser('john', 'pwd')

    expect(res).toBeNull()
    expect(ldapClient.bind).toHaveBeenCalledWith('cn=svc,dc=example,dc=org', 'secret')
    expect(ldapClient.bind).toHaveBeenCalledWith('uid=john,ou=people,dc=example,dc=org', 'pwd')
  })

  it('should keep admin role when adminGroup is not configured', async () => {
    setLdapConfig({ options: { adminGroup: undefined } })
    const existingUser: any = buildUser({ id: 5, role: USER_ROLE.ADMINISTRATOR })
    usersManager.findUser.mockResolvedValue(existingUser)
    mockBindResolve()
    mockSearchEntries([{ uid: 'john', cn: 'John Doe', mail: 'john@example.org' }])
    jest.spyOn(commonFunctions, 'comparePassword').mockResolvedValue(true)

    await authProviderLDAP.validateUser('john', 'pwd')

    expect(adminUsersManager.updateUserOrGuest).toHaveBeenCalled()
    const updateArgs = adminUsersManager.updateUserOrGuest.mock.calls[0][1]
    expect(updateArgs).toEqual(expect.objectContaining({ email: 'john@example.org' }))
    expect(updateArgs).toEqual(expect.not.objectContaining({ role: expect.anything() }))
  })

  it('should update existing user and avoid reassigning password locally', async () => {
    const existingUser: any = buildUser({ id: 6 })
    usersManager.findUser.mockResolvedValue(existingUser)
    mockBindResolve()
    mockSearchEntries([{ uid: 'john', displayName: 'Jane Doe', mail: 'john@example.org' }])
    const compareSpy = jest.spyOn(commonFunctions, 'comparePassword').mockResolvedValue(false)
    const splitSpy = jest.spyOn(commonFunctions, 'splitFullName').mockReturnValue({ firstName: 'Jane', lastName: 'Doe' })

    const res = await authProviderLDAP.validateUser('john', 'new-plain-password', '127.0.0.2')

    expect(adminUsersManager.updateUserOrGuest).toHaveBeenCalledWith(
      6,
      expect.objectContaining({
        email: 'john@example.org',
        firstName: 'Jane',
        lastName: 'Doe'
      })
    )
    expect(existingUser.password).toBe('hashed')
    expect(existingUser).toMatchObject({ email: 'john@example.org', firstName: 'Jane', lastName: 'Doe' })
    expect(existingUser.setFullName).toHaveBeenCalledWith(true)
    expect(usersManager.updateAccesses).toHaveBeenCalledWith(existingUser, '127.0.0.2', true)
    expect(res).toBe(existingUser)

    compareSpy.mockRestore()
    splitSpy.mockRestore()
  })

  it('should throw FORBIDDEN when LDAP login does not match user login', async () => {
    const existingUser: any = buildUser({ id: 7, login: 'john' })
    usersManager.findUser.mockResolvedValue(existingUser)
    mockBindResolve()
    mockSearchEntries([{ uid: 'jane', cn: 'Jane Doe', mail: 'jane@example.org' }])

    await expect(authProviderLDAP.validateUser('john', 'pwd')).rejects.toThrow(/account matching error/i)
  })

  it('should build LDAP logins and filters for AD and standard LDAP', () => {
    setLdapConfig({ attributes: { login: LDAP_LOGIN_ATTR.UPN }, upnSuffix: 'sync-in.com', filter: '(memberOf=cn=staff)' })
    const adLogin = (authProviderLDAP as any).buildLdapLogin('john')
    expect(adLogin).toBe('john@sync-in.com')
    const adFilter = (authProviderLDAP as any).buildUserFilter('SYNC-IN\\john', '(memberOf=cn=staff)')
    expect(adFilter).toContain('(sAMAccountName=john)')
    expect(adFilter).toContain('(userPrincipalName=john)')
    expect(adFilter).toContain('(mail=john)')
    expect(adFilter).toContain('(memberOf=cn=staff)')

    setLdapConfig({ attributes: { login: LDAP_LOGIN_ATTR.UID }, filter: '(department=IT)' })
    const ldapFilter = (authProviderLDAP as any).buildUserFilter('john', '(department=IT)')
    expect(ldapFilter).toContain('(uid=john)')
    expect(ldapFilter).toContain('(cn=john)')
    expect(ldapFilter).toContain('(mail=john)')
    expect(ldapFilter).toContain('(department=IT)')
  })

  it('should normalize LDAP entries for memberOf and array attributes', () => {
    const entry = {
      uid: ['john'],
      mail: ['john@example.org', 'john2@example.org'],
      memberOf: ['CN=Admins,OU=Groups,DC=example,DC=org', 'CN=Staff,OU=Groups,DC=example,DC=org']
    }

    const normalized = (authProviderLDAP as any).convertToLdapUserEntry(entry)

    expect(normalized.uid).toBe('john')
    expect(normalized.mail).toBe('john@example.org')
    expect(normalized.memberOf).toEqual(['CN=Admins,OU=Groups,DC=example,DC=org', 'Admins', 'CN=Staff,OU=Groups,DC=example,DC=org', 'Staff'])
  })

  it('should build LDAP logins for SAM account name when netbiosName is set', () => {
    setLdapConfig({ attributes: { login: LDAP_LOGIN_ATTR.SAM }, netbiosName: 'SYNC' })
    const samLogin = (authProviderLDAP as any).buildLdapLogin('john')
    expect(samLogin).toBe('SYNC\\john')
  })
})
