/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Test, TestingModule } from '@nestjs/testing'
import { Mocked } from 'jest-mock'
import { Client, InvalidCredentialsError } from 'ldapts'
import { CONNECT_ERROR_CODE } from '../../../app.constants'
import { UserModel } from '../../../applications/users/models/user.model'
import { AdminUsersManager } from '../../../applications/users/services/admin-users-manager.service'
import { UsersManager } from '../../../applications/users/services/users-manager.service'
import * as commonFunctions from '../../../common/functions'
import { configuration } from '../../../configuration/config.environment'
import { LDAP_LOGIN_ATTR } from './auth-ldap.constants'
import { AuthProviderLDAP } from './auth-provider-ldap.service'

// Mock ldapts Client to simulate LDAP behaviors
jest.mock('ldapts', () => {
  const actual = jest.requireActual('ldapts')
  const mockClientInstance = {
    bind: jest.fn(),
    search: jest.fn(),
    unbind: jest.fn()
  }
  const Client = jest.fn().mockImplementation(() => mockClientInstance)
  // Conserver tous les autres exports réels (dont EqualityFilter, AndFilter, InvalidCredentialsError, etc.)
  return { ...actual, Client }
})

// --- Test helpers (DRY) ---
// Reusable LDAP mocks
const mockBindResolve = (ldapClient: any) => {
  ldapClient.bind.mockResolvedValue(undefined)
  ldapClient.unbind.mockResolvedValue(undefined)
}
const mockBindRejectInvalid = (ldapClient: any, InvalidCredentialsErrorCtor: any, message = 'invalid') => {
  ldapClient.bind.mockRejectedValue(new InvalidCredentialsErrorCtor(message))
  ldapClient.unbind.mockResolvedValue(undefined)
}
const mockSearchEntries = (ldapClient: any, entries: any[]) => {
  ldapClient.search.mockResolvedValue({ searchEntries: entries })
}
const mockSearchReject = (ldapClient: any, err: Error) => {
  ldapClient.search.mockRejectedValue(err)
}
// User factory
const buildUser = (overrides: Partial<UserModel> = {}) =>
  ({
    id: 0,
    login: 'john',
    email: 'old@example.org',
    password: 'hashed',
    isGuest: false,
    isActive: true,
    makePaths: jest.fn().mockResolvedValue(undefined),
    setFullName: jest.fn(), // needed when firstName/lastName change
    ...overrides
  }) as any

// --------------------------

describe(AuthProviderLDAP.name, () => {
  let authMethodLdapService: AuthProviderLDAP
  let usersManager: Mocked<UsersManager>
  let adminUsersManager: Mocked<AdminUsersManager>
  const ldapClient = {
    bind: jest.fn(),
    search: jest.fn(),
    unbind: jest.fn()
  }
  ;(Client as Mocked<any>).mockImplementation(() => ldapClient)

  // Local helpers (need access to authMethodLdapService and ldapClient in this scope)
  const setupLdapSuccess = (entries: any[]) => {
    mockBindResolve(ldapClient)
    mockSearchEntries(ldapClient, entries)
  }
  const spyLoggerError = () => jest.spyOn(authMethodLdapService['logger'], 'error').mockImplementation(() => undefined as any)

  beforeAll(async () => {
    configuration.auth.ldap = {
      servers: ['ldap://localhost:389'],
      attributes: { login: LDAP_LOGIN_ATTR.UID, email: 'mail' },
      baseDN: 'ou=people,dc=example,dc=org',
      filter: ''
    }

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
    authMethodLdapService = module.get<AuthProviderLDAP>(AuthProviderLDAP)
    adminUsersManager = module.get<Mocked<AdminUsersManager>>(AdminUsersManager)
    usersManager = module.get<Mocked<UsersManager>>(UsersManager)
  })

  it('should be defined', () => {
    expect(authMethodLdapService).toBeDefined()
    expect(usersManager).toBeDefined()
    expect(adminUsersManager).toBeDefined()
    expect(ldapClient).toBeDefined()
  })

  it('should authenticate a guest user via database and bypass LDAP', async () => {
    // Arrange
    const guestUser: any = { id: 1, login: 'guest1', isGuest: true, isActive: true }
    usersManager.findUser.mockResolvedValue(guestUser)
    const dbAuthResult: any = { ...guestUser, token: 'jwt' }
    usersManager.logUser.mockResolvedValue(dbAuthResult)
    const res = await authMethodLdapService.validateUser('guest1', 'pass', '127.0.0.1')
    expect(res).toEqual(dbAuthResult)
    expect(usersManager.logUser).toHaveBeenCalledWith(guestUser, 'pass', '127.0.0.1')
    expect(Client).not.toHaveBeenCalled() // client should not be constructed
  })

  it('should throw FORBIDDEN for locked account and resolve null for LDAP login mismatch', async () => {
    // Phase 1: locked account
    usersManager.findUser.mockResolvedValue({ login: 'john', isGuest: false, isActive: false } as UserModel)
    const loggerErrorSpy1 = jest.spyOn(authMethodLdapService['logger'], 'error').mockImplementation(() => undefined as any)
    await expect(authMethodLdapService.validateUser('john', 'pwd')).rejects.toThrow(/account locked/i)
    expect(loggerErrorSpy1).toHaveBeenCalled()

    // Phase 2: mismatch between requested login and LDAP returned login -> service renvoie null
    const existingUser: any = buildUser({ id: 8 })
    usersManager.findUser.mockResolvedValue(existingUser)
    mockBindResolve(ldapClient)
    mockSearchEntries(ldapClient, [{ uid: 'jane', cn: 'john', mail: 'jane@example.org' }])
    await expect(authMethodLdapService.validateUser('john', 'pwd')).rejects.toThrow(/account matching error/i)
  })

  it('should handle invalid LDAP credentials for both existing and unknown users', async () => {
    // Phase 1: existing user -> updateAccesses invoked with success=false and logger.error intercepted
    const existingUser: any = buildUser({ id: 1 })
    usersManager.findUser.mockResolvedValue(existingUser)
    // Make LDAP bind throw InvalidCredentialsError
    mockBindRejectInvalid(ldapClient, InvalidCredentialsError, 'invalid credentials')
    // Force updateAccesses to reject to hit the catch and logger.error
    const loggerErrorSpy = jest.spyOn(authMethodLdapService['logger'], 'error').mockImplementation(() => undefined as any)
    usersManager.updateAccesses.mockRejectedValueOnce(new Error('updateAccesses boom'))
    const res1 = await authMethodLdapService.validateUser('john', 'badpwd', '10.0.0.1')
    expect(res1).toBeNull()
    expect(usersManager.updateAccesses).toHaveBeenCalledWith(existingUser, '10.0.0.1', false)
    expect(loggerErrorSpy).toHaveBeenCalled()

    // Phase 2: unknown user → no access update
    usersManager.updateAccesses.mockClear()
    usersManager.findUser.mockResolvedValue(null)
    ldapClient.bind.mockRejectedValue(new InvalidCredentialsError('invalid'))
    ldapClient.unbind.mockResolvedValue(undefined)
    const res2 = await authMethodLdapService.validateUser('jane', 'badpwd')
    expect(res2).toBeNull()
    expect(usersManager.updateAccesses).not.toHaveBeenCalled()
  })

  it('should handle LDAP new-user flow: missing fields, creation success, and multi-email selection', async () => {
    // Phase 1: incomplete LDAP entry -> null + error log, no creation
    usersManager.findUser.mockResolvedValue(null)
    mockBindResolve(ldapClient)
    // Simulate an entry with missing mail
    mockSearchEntries(ldapClient, [{ uid: 'jane', cn: 'Jane Doe', mail: undefined }])
    const loggerErrorSpy = jest.spyOn(authMethodLdapService['logger'], 'error').mockImplementation(() => undefined as any)
    const resA = await authMethodLdapService.validateUser('jane', 'pwd')
    expect(resA).toBeNull()
    expect(adminUsersManager.createUserOrGuest).not.toHaveBeenCalled()
    expect(loggerErrorSpy).toHaveBeenCalled()

    // Phase 2: create a new user (success, single email)
    // Stub directement checkAuth pour retourner une entrée LDAP valide
    const checkAuthSpy = jest.spyOn<any, any>(authMethodLdapService as any, 'checkAuth')
    checkAuthSpy.mockResolvedValueOnce({ uid: 'john', cn: 'John Doe', mail: 'john@example.org' } as any)
    adminUsersManager.createUserOrGuest.mockClear()
    usersManager.findUser.mockResolvedValue(null)
    const createdUser: any = { id: 2, login: 'john', isGuest: false, isActive: true, makePaths: jest.fn() }
    adminUsersManager.createUserOrGuest.mockResolvedValue(createdUser)
    // If the service reloads the user via fromUserId after creation
    usersManager.fromUserId.mockResolvedValue(createdUser)
    // Cover the success-flow catch branch
    const loggerErrorSpy2 = spyLoggerError()
    usersManager.updateAccesses.mockRejectedValueOnce(new Error('updateAccesses success flow boom'))
    const resB = await authMethodLdapService.validateUser('john', 'pwd', '192.168.1.10')
    expect(adminUsersManager.createUserOrGuest).toHaveBeenCalledWith(
      { login: 'john', email: 'john@example.org', password: 'pwd', firstName: 'John', lastName: 'Doe', role: 1 },
      expect.anything() // USER_ROLE.USER
    )
    expect(resB).toBe(createdUser)
    expect(usersManager.updateAccesses).toHaveBeenCalledWith(createdUser, '192.168.1.10', true)
    expect(loggerErrorSpy2).toHaveBeenCalled()
    // Phase 3: multiple emails -> keep the first
    adminUsersManager.createUserOrGuest.mockClear()
    usersManager.findUser.mockResolvedValue(null)
    setupLdapSuccess([{ uid: 'multi', cn: 'Multi Mail', mail: ['first@example.org', 'second@example.org'] }])
    const createdUser2: any = { id: 9, login: 'multi', makePaths: jest.fn() }
    adminUsersManager.createUserOrGuest.mockResolvedValue(createdUser2)
    usersManager.fromUserId.mockResolvedValue(createdUser2)
    const resC = await authMethodLdapService.validateUser('multi', 'pwd')
    expect(adminUsersManager.createUserOrGuest).toHaveBeenCalledWith(expect.objectContaining({ email: 'first@example.org' }), expect.anything())
    expect(resC).toBe(createdUser2)
  })

  it('should update existing user profile when LDAP identity changed (except password assigned back)', async () => {
    // Arrange: existing user with different profile and an old password
    const existingUser: any = buildUser({ id: 5 })
    usersManager.findUser.mockResolvedValue(existingUser)
    // LDAP succeeds and returns different email and same uid
    setupLdapSuccess([{ uid: 'john', cn: 'John Doe', mail: 'john@example.org' }])
    // Admin manager successfully updates a user
    adminUsersManager.updateUserOrGuest.mockResolvedValue(undefined)
    // Ensure password is considered changed so the update payload includes it,
    // which then triggers the deletion and local assignment branches after update
    const compareSpy = jest.spyOn(commonFunctions, 'comparePassword').mockResolvedValue(false)
    const res = await authMethodLdapService.validateUser('john', 'new-plain-password', '127.0.0.2')
    expect(adminUsersManager.updateUserOrGuest).toHaveBeenCalledWith(
      5,
      expect.objectContaining({
        email: 'john@example.org',
        firstName: 'John',
        lastName: 'Doe'
      })
    )
    // Password should not be assigned back onto the user object (it is deleted before Object.assign)
    expect(existingUser.password).toBe('hashed')
    // Other fields should be updated locally
    expect(existingUser.email).toBe('john@example.org')
    expect(existingUser).toMatchObject({ firstName: 'John', lastName: 'Doe' })
    // Accesses updated as success
    expect(usersManager.updateAccesses).toHaveBeenCalledWith(existingUser, '127.0.0.2', true)
    // Returned user is the same instance
    expect(res).toBe(existingUser)

    // Second run: password unchanged (comparePassword => true) to cover the null branch for password
    adminUsersManager.updateUserOrGuest.mockClear()
    usersManager.updateAccesses.mockClear()
    // Force another non-password change so an update occurs
    existingUser.email = 'old@example.org'
    compareSpy.mockResolvedValue(true)
    const res2 = await authMethodLdapService.validateUser('john', 'same-plain-password', '127.0.0.3')
    // Update should be called without password, only with changed fields
    expect(adminUsersManager.updateUserOrGuest).toHaveBeenCalled()
    const updateArgs = adminUsersManager.updateUserOrGuest.mock.calls[0]
    expect(updateArgs[0]).toBe(5)
    expect(updateArgs[1]).toEqual(
      expect.objectContaining({
        email: 'john@example.org'
      })
    )
    expect(updateArgs[1]).toEqual(expect.not.objectContaining({ password: expect.anything() }))
    // Password remains unchanged locally
    expect(existingUser.password).toBe('hashed')
    // Accesses updated as success
    expect(usersManager.updateAccesses).toHaveBeenCalledWith(existingUser, '127.0.0.3', true)
    // Returned user is the same instance
    expect(res2).toBe(existingUser)
    // Third run: no changes at all (identityHasChanged is empty) to cover the else branch
    adminUsersManager.updateUserOrGuest.mockClear()
    usersManager.updateAccesses.mockClear()
    compareSpy.mockResolvedValue(true)
    // Local user already matches LDAP identity; call again
    const res3 = await authMethodLdapService.validateUser('john', 'same-plain-password', '127.0.0.4')
    // No update should be triggered
    expect(adminUsersManager.updateUserOrGuest).not.toHaveBeenCalled()
    // Access should still be updated as success
    expect(usersManager.updateAccesses).toHaveBeenCalledWith(existingUser, '127.0.0.4', true)
    // Returned user is the same instance
    expect(res3).toBe(existingUser)
  })

  it('should log failed access when LDAP search returns no entry or throws after bind', async () => {
    // Phase 1: no entry found after a successful bind -> failed access
    const existingUser: any = { id: 7, login: 'ghost', isGuest: false, isActive: true }
    usersManager.findUser.mockResolvedValue(existingUser)
    setupLdapSuccess([])
    const resA = await authMethodLdapService.validateUser('ghost', 'pwd', '10.10.0.1')
    expect(resA).toBeNull()
    expect(usersManager.updateAccesses).toHaveBeenCalledWith(existingUser, '10.10.0.1', false)

    // Phase 2: exception during search after a bind -> failed access
    jest.clearAllMocks()
    const existingUser2: any = { id: 10, login: 'john', isGuest: false, isActive: true }
    usersManager.findUser.mockResolvedValue(existingUser2)
    mockBindResolve(ldapClient)
    mockSearchReject(ldapClient, new Error('search failed'))
    const resB = await authMethodLdapService.validateUser('john', 'pwd', '1.1.1.1')
    expect(resB).toBeNull()
    expect(usersManager.updateAccesses).toHaveBeenCalledWith(existingUser2, '1.1.1.1', false)
  })

  it('should allow app password when LDAP fails and scope is provided', async () => {
    const existingUser: any = buildUser({ id: 42 })
    usersManager.findUser.mockResolvedValue(existingUser)
    // LDAP invalid credentials
    mockBindRejectInvalid(ldapClient, InvalidCredentialsError, 'invalid credentials')
    // App password success
    usersManager.validateAppPassword.mockResolvedValue(true)
    const res = await authMethodLdapService.validateUser('john', 'app-password', '10.0.0.2', 'webdav' as any)
    expect(res).toBe(existingUser)
    expect(usersManager.validateAppPassword).toHaveBeenCalledWith(existingUser, 'app-password', '10.0.0.2', 'webdav')
    expect(usersManager.updateAccesses).toHaveBeenCalledWith(existingUser, '10.0.0.2', true)
  })

  it('should throw 500 when LDAP connection error occurs during bind', async () => {
    // Arrange: no existing user to reach checkAuth flow
    usersManager.findUser.mockResolvedValue(null)
    const err1 = new Error('socket hang up')
    const err2 = Object.assign(new Error('connect ECONNREFUSED'), { code: Array.from(CONNECT_ERROR_CODE)[0] })
    ldapClient.bind.mockRejectedValue({ errors: [err1, err2] })
    ldapClient.unbind.mockResolvedValue(undefined)

    // First scenario: recognized connection error -> throws 500
    await expect(authMethodLdapService.validateUser('john', 'pwd')).rejects.toThrow(/authentication service/i)

    // Second scenario: generic error (no code, not InvalidCredentialsError) -> resolves to null and no access update
    ldapClient.bind.mockReset()
    ldapClient.unbind.mockReset()
    usersManager.updateAccesses.mockClear()
    usersManager.findUser.mockResolvedValue(null as any)
    ldapClient.bind.mockRejectedValue(new Error('unexpected failure'))
    ldapClient.unbind.mockResolvedValue(undefined)

    const res = await authMethodLdapService.validateUser('john', 'pwd')
    expect(res).toBeNull()
    expect(usersManager.updateAccesses).not.toHaveBeenCalled()
  })

  it('should log update failure when updating existing user', async () => {
    // Arrange: existing user with changed identity
    const existingUser: any = buildUser({ id: 11, email: 'old@ex.org' })
    usersManager.findUser.mockResolvedValue(existingUser)
    // Ensure LDAP loginAttribute matches uid for this test (a previous test sets it to 'cn')
    setupLdapSuccess([{ uid: 'john', cn: 'John Doe', mail: 'john@example.org' }])
    adminUsersManager.updateUserOrGuest.mockRejectedValue(new Error('db error'))
    // Force identity to be considered changed only for this test
    jest.spyOn(commonFunctions, 'comparePassword').mockResolvedValue(false)
    jest.spyOn(commonFunctions, 'splitFullName').mockReturnValue({ firstName: 'John', lastName: 'Doe' })
    const res = await authMethodLdapService.validateUser('john', 'pwd')
    expect(adminUsersManager.updateUserOrGuest).toHaveBeenCalled()
    // Local fields unchanged since update failed
    expect(existingUser.email).toBe('old@ex.org')
    expect(res).toBe(existingUser)
  })

  it('should skip non-matching LDAP entries then update user with changed password without reassigning it', async () => {
    // Phase A: LDAP returns an entry but loginAttribute value does not match -> checkAccess returns false (covers return after loop)
    const userA: any = { id: 20, login: 'john', isGuest: false, isActive: true }
    usersManager.findUser.mockResolvedValue(userA)
    ldapClient.bind.mockResolvedValue(undefined)

    // Phase B: Matching entry + password considered changed -> updateUserOrGuest called, password not reassigned locally
    jest.clearAllMocks()
    const userB: any = buildUser({ id: 21, email: 'old@ex.org' })
    usersManager.findUser.mockResolvedValue(userB)
    setupLdapSuccess([{ uid: 'john', cn: 'John Doe', mail: 'john@example.org' }])
    adminUsersManager.updateUserOrGuest.mockResolvedValue(undefined)

    // Force password to be considered changed to execute deletion + Object.assign branch
    jest.spyOn(commonFunctions, 'comparePassword').mockResolvedValue(false)
    jest.spyOn(commonFunctions, 'splitFullName').mockReturnValue({ firstName: 'John', lastName: 'Doe' })
    const resB = await authMethodLdapService.validateUser('john', 'newpwd', '4.4.4.4')

    // Line 132: updateUserOrGuest call
    expect(adminUsersManager.updateUserOrGuest).toHaveBeenCalledWith(
      21,
      expect.objectContaining({ email: 'john@example.org', firstName: 'John', lastName: 'Doe' })
    )

    // Lines 139-142: password removed from local assign, other fields assigned
    expect(userB.password).toBe('hashed')
    expect(userB.email).toBe('john@example.org')
    expect(userB).toMatchObject({ firstName: 'John', lastName: 'Doe' })
    expect(resB).toBe(userB)
  })
})
