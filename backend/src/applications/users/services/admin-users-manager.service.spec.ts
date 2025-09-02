/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { AuthManager } from '../../../authentication/services/auth-manager.service'
import { GROUP_TYPE } from '../constants/group'
import { USER_GROUP_ROLE, USER_ROLE } from '../constants/user'
import type { CreateOrUpdateGroupDto } from '../dto/create-or-update-group.dto'
import { CreateUserDto, UpdateUserDto, UpdateUserFromGroupDto } from '../dto/create-or-update-user.dto'
import type { AdminDeleteUserDto } from '../dto/delete-user.dto'
import type { SearchMembersDto } from '../dto/search-members.dto'
import type { UserPasswordDto } from '../dto/user-password.dto'
import { UserModel } from '../models/user.model'
import { AdminUsersManager } from './admin-users-manager.service'
import { AdminUsersQueries } from './admin-users-queries.service'

// mock file utils used by the service (delete/rename user space)
jest.mock('../../files/utils/files', () => ({
  isPathExists: jest.fn(),
  moveFiles: jest.fn(),
  removeFiles: jest.fn()
}))

// mock hash/anonymize utilities (preserve other module exports)
jest.mock('../../../common/functions', () => {
  const actual = jest.requireActual('../../../common/functions')
  return {
    ...actual,
    hashPassword: jest.fn(async (pwd: string) => `hashed:${pwd}`),
    anonymizePassword: jest.fn((dto: any) => ({ ...dto, password: '***' }))
  }
})

// Alias FS mocks (avoid repetitions)
const fs = jest.requireMock('../../files/utils/files') as { isPathExists: jest.Mock; moveFiles: jest.Mock; removeFiles: jest.Mock }

// Helper utilities
const expectHttp = async (p: Promise<any>) => expect(p).rejects.toBeInstanceOf(HttpException)
const spyMakePaths = () => jest.spyOn(UserModel.prototype, 'makePaths').mockResolvedValueOnce(undefined)

describe(AdminUsersManager.name, () => {
  let service: AdminUsersManager

  // deep mocks
  let authManagerMock: { setCookies: jest.Mock }
  let adminQueriesMock: {
    listUsers: jest.Mock
    usersQueries: {
      listGuests: jest.Mock
      from: jest.Mock
      createUserOrGuest: jest.Mock
      updateUserOrGuest: jest.Mock
      deleteUser: jest.Mock
      compareUserPassword: jest.Mock
      checkGroupNameExists: jest.Mock
      checkUserExists: jest.Mock
      searchUsersOrGroups: jest.Mock
    }
    updateUserGroups: jest.Mock
    updateGuestManagers: jest.Mock
    deleteUser: jest.Mock
    groupFromName: jest.Mock
    browseGroupMembers: jest.Mock
    browseRootGroupMembers: jest.Mock
    groupFromId: jest.Mock
    createGroup: jest.Mock
    updateGroup: jest.Mock
    deleteGroup: jest.Mock
    addUsersToGroup: jest.Mock
    updateUserFromGroup: jest.Mock
    removeUserFromGroup: jest.Mock
  }

  const setUser = (u: any) => adminQueriesMock.listUsers.mockResolvedValueOnce(u)
  const setGuest = (g: any) => adminQueriesMock.usersQueries.listGuests.mockResolvedValueOnce(g)

  const baseUser = {
    id: 10,
    login: 'john',
    email: 'john@example.com',
    isActive: true,
    role: USER_ROLE.USER,
    groups: [{ id: 1 }, { id: 3 }]
  } as any

  beforeAll(async () => {
    authManagerMock = { setCookies: jest.fn() }

    adminQueriesMock = {
      listUsers: jest.fn(),
      usersQueries: {
        listGuests: jest.fn(),
        from: jest.fn(),
        createUserOrGuest: jest.fn(),
        updateUserOrGuest: jest.fn(),
        deleteUser: jest.fn(),
        compareUserPassword: jest.fn(),
        checkGroupNameExists: jest.fn(),
        checkUserExists: jest.fn(),
        searchUsersOrGroups: jest.fn()
      },
      updateUserGroups: jest.fn(),
      updateGuestManagers: jest.fn(),
      deleteUser: jest.fn(),
      groupFromName: jest.fn(),
      browseGroupMembers: jest.fn(),
      browseRootGroupMembers: jest.fn(),
      groupFromId: jest.fn(),
      createGroup: jest.fn(),
      updateGroup: jest.fn(),
      deleteGroup: jest.fn(),
      addUsersToGroup: jest.fn(),
      updateUserFromGroup: jest.fn(),
      removeUserFromGroup: jest.fn()
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminUsersManager, { provide: AuthManager, useValue: authManagerMock }, { provide: AdminUsersQueries, useValue: adminQueriesMock }]
    }).compile()

    module.useLogger(['fatal'])
    service = module.get<AdminUsersManager>(AdminUsersManager)
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('getUser / getGuest', () => {
    it('user ok + not found + guest ok', async () => {
      setUser(baseUser)
      expect(await service.getUser(10)).toEqual(baseUser)
      expect(adminQueriesMock.listUsers).toHaveBeenCalledWith(10)

      setUser(null)
      await expectHttp(service.getUser(999))

      const guest = { id: 22, login: 'guest', email: 'g@x', managers: [], role: USER_ROLE.GUEST }
      setGuest(guest as any)
      expect(await service.getGuest(22)).toEqual(guest)
      expect(adminQueriesMock.usersQueries.listGuests).toHaveBeenCalledWith(22, 0, true)
    })
  })

  describe('createUserOrGuest', () => {
    it.each([
      { role: USER_ROLE.USER, asAdmin: false, id: 101, exp: 'UserModel' },
      { role: USER_ROLE.GUEST, asAdmin: true, id: 202, exp: 'AdminGuest' },
      { role: USER_ROLE.USER, asAdmin: true, id: 707, exp: 'AdminUser' },
      { role: USER_ROLE.GUEST, asAdmin: false, id: 808, exp: 'UserModel' }
    ])('creation matrix ($role / asAdmin=$asAdmin)', async ({ role, asAdmin, id, exp }) => {
      const dto: CreateUserDto = { login: 'alice', email: 'a@x', password: 'pwd', managers: role === USER_ROLE.GUEST ? [1] : [] } as any
      adminQueriesMock.usersQueries.checkUserExists.mockResolvedValueOnce(false)
      adminQueriesMock.usersQueries.createUserOrGuest.mockResolvedValueOnce(id)
      spyMakePaths()

      if (exp === 'AdminUser') setUser({ id, login: 'alice', role })
      if (exp === 'AdminGuest') setGuest({ id, login: 'alice', role } as any)

      const res = await (service as any).createUserOrGuest(dto, role, asAdmin)

      if (exp === 'UserModel') {
        expect(res).toBeInstanceOf(UserModel)
        expect((res as any).id).toBe(id)
      } else if (exp === 'AdminUser') {
        expect(adminQueriesMock.listUsers).toHaveBeenCalledWith(id)
      } else {
        expect(adminQueriesMock.usersQueries.listGuests).toHaveBeenCalledWith(id, 0, true)
      }
      expect(adminQueriesMock.usersQueries.createUserOrGuest).toHaveBeenCalledWith(
        expect.objectContaining({ login: 'alice', email: 'a@x', password: 'hashed:pwd' }),
        role
      )
    })

    it('creation errors: duplication and DB error', async () => {
      adminQueriesMock.usersQueries.checkUserExists.mockResolvedValueOnce({ login: 'dup', email: 'dup@x' })
      await expectHttp(service.createUserOrGuest({ login: 'dup', email: 'dup@x', password: 'p', managers: [] } as any, USER_ROLE.USER, false))

      adminQueriesMock.usersQueries.checkUserExists.mockResolvedValueOnce(false)
      adminQueriesMock.usersQueries.createUserOrGuest.mockRejectedValueOnce(new Error('db fail'))
      await expectHttp(service.createUserOrGuest({ login: 'bob', email: 'b@x', password: 'p', managers: [] } as any, USER_ROLE.USER, false))
    })
  })

  describe('updateUserOrGuest - USER branch', () => {
    it('full update + FS rename + groups diff', async () => {
      const current = { ...baseUser, groups: [{ id: 1 }, { id: 3 }] }
      setUser(current)
      const updated = { ...current, login: 'johnny', email: 'j@new' }
      setUser(updated)

      adminQueriesMock.usersQueries.checkUserExists.mockResolvedValueOnce(false)
      adminQueriesMock.usersQueries.checkUserExists.mockResolvedValueOnce(false)
      fs.isPathExists.mockResolvedValueOnce(true)
      fs.isPathExists.mockResolvedValueOnce(false)
      fs.moveFiles.mockResolvedValueOnce(undefined)
      adminQueriesMock.usersQueries.updateUserOrGuest.mockResolvedValueOnce(true)
      adminQueriesMock.updateUserGroups.mockResolvedValueOnce(undefined)

      const dto: UpdateUserDto = { login: 'johnny', email: 'j@new', isActive: true, password: 'newpwd', groups: [3, 5] }
      const res = await service.updateUserOrGuest(current.id, dto)

      expect(adminQueriesMock.usersQueries.updateUserOrGuest).toHaveBeenCalledWith(
        current.id,
        expect.objectContaining({ login: 'johnny', email: 'j@new', isActive: true, passwordAttempts: 0, password: 'hashed:newpwd' }),
        undefined
      )
      expect(adminQueriesMock.updateUserGroups).toHaveBeenCalledWith(current.id, { add: [5], delete: [1] })
      expect(res).toEqual(updated)
    })

    it('login/email conflict', async () => {
      const current = { ...baseUser }
      setUser(current)
      adminQueriesMock.usersQueries.checkUserExists.mockResolvedValueOnce(true)
      await expectHttp(service.updateUserOrGuest(current.id, { login: 'taken' } as any))

      setUser(current)
      adminQueriesMock.usersQueries.checkUserExists.mockResolvedValueOnce(true)
      await expectHttp(service.updateUserOrGuest(current.id, { email: 'dup@x' } as any))
      expect(adminQueriesMock.usersQueries.updateUserOrGuest).not.toHaveBeenCalled()
    })

    it('renameUserSpace impossible (new space exists)', async () => {
      const current = { ...baseUser }
      setUser(current)
      adminQueriesMock.usersQueries.checkUserExists.mockResolvedValueOnce(false)
      fs.isPathExists.mockResolvedValueOnce(true) // current
      fs.isPathExists.mockResolvedValueOnce(true) // new already exists
      fs.moveFiles.mockResolvedValue(undefined)
      await expectHttp(service.updateUserOrGuest(current.id, { login: 'new' } as any))
    })

    it('DB update false => INTERNAL_SERVER_ERROR', async () => {
      const current = { ...baseUser }
      setUser(current)
      adminQueriesMock.usersQueries.updateUserOrGuest.mockResolvedValueOnce(false)
      await expectHttp(service.updateUserOrGuest(current.id, { email: 'e@x' } as any))
    })

    it('updateUserGroups fails', async () => {
      const current = { ...baseUser, groups: [{ id: 1 }] }
      setUser(current)
      adminQueriesMock.usersQueries.updateUserOrGuest.mockResolvedValueOnce(true)
      adminQueriesMock.updateUserGroups.mockRejectedValueOnce(new Error('group error'))
      await expectHttp(service.updateUserOrGuest(current.id, { groups: [2] } as any))
    })

    it('no change when login or email unchanged', async () => {
      const current = { ...baseUser }
      setUser(current)
      setUser(current)
      expect(await service.updateUserOrGuest(current.id, { login: current.login } as any)).toEqual(current)
      expect(adminQueriesMock.usersQueries.checkUserExists).not.toHaveBeenCalled()

      setUser(current)
      setUser(current)
      expect(await service.updateUserOrGuest(current.id, { email: current.email } as any)).toEqual(current)
      expect(adminQueriesMock.usersQueries.updateUserOrGuest).not.toHaveBeenCalled()
    })

    it('default branch (unknown field)', async () => {
      const current = { ...baseUser }
      setUser(current)
      adminQueriesMock.usersQueries.updateUserOrGuest.mockResolvedValueOnce(true)
      const updated = { ...current, language: 'fr' } as any
      setUser(updated)

      const res = await service.updateUserOrGuest(current.id, { language: 'fr' } as any)
      expect(adminQueriesMock.usersQueries.updateUserOrGuest).toHaveBeenCalledWith(current.id, expect.objectContaining({ language: 'fr' }), undefined)
      expect(res).toEqual(updated)
    })
  })

  describe('updateUserOrGuest - GUEST branch', () => {
    it('update guest + managers diff', async () => {
      const guest = { id: 33, login: 'g', email: 'g@x', managers: [{ id: 2 }, { id: 7 }], role: USER_ROLE.GUEST }
      setGuest(guest as any)
      const updatedGuest = { ...guest, email: 'new@x' }
      setGuest(updatedGuest as any)

      adminQueriesMock.usersQueries.updateUserOrGuest.mockResolvedValueOnce(true)
      adminQueriesMock.updateGuestManagers.mockResolvedValueOnce(undefined)

      const res = await service.updateUserOrGuest(guest.id, { email: 'new@x', managers: [7, 9] } as UpdateUserDto, USER_ROLE.GUEST)
      expect(adminQueriesMock.usersQueries.updateUserOrGuest).toHaveBeenCalledWith(guest.id, { email: 'new@x' }, USER_ROLE.GUEST)
      expect(adminQueriesMock.updateGuestManagers).toHaveBeenCalledWith(guest.id, { add: [9], delete: [2] })
      expect(res).toEqual(updatedGuest)
    })

    it('validations updateGuest', async () => {
      expect(() => service.updateGuest(1, {} as any)).toThrow(/no changes to update/i)
      expect(() => service.updateGuest(1, { managers: [] } as any)).toThrow(/guest must have at least one manager/i)
    })

    it('updateGuestManagers échoue', async () => {
      const guest = { id: 33, login: 'g', email: 'g@x', managers: [{ id: 2 }], role: USER_ROLE.GUEST }
      setGuest(guest as any)
      adminQueriesMock.usersQueries.updateUserOrGuest.mockResolvedValueOnce(true)
      adminQueriesMock.updateGuestManagers.mockRejectedValueOnce(new Error('mgr error'))
      await expectHttp(service.updateUserOrGuest(guest.id, { managers: [3] } as any, USER_ROLE.GUEST))
    })
  })

  describe('deleteUserOrGuest / deleteGuest', () => {
    it('delete user + optional space and errors', async () => {
      adminQueriesMock.deleteUser.mockResolvedValueOnce(true)
      fs.isPathExists.mockResolvedValueOnce(true)
      fs.removeFiles.mockResolvedValueOnce(undefined)
      await expect(service.deleteUserOrGuest(10, 'john', { deleteSpace: true, isGuest: false })).resolves.toBeUndefined()
      expect(adminQueriesMock.deleteUser).toHaveBeenCalledWith(10, 'john')
      expect(fs.isPathExists).toHaveBeenCalled()
      expect(fs.removeFiles).toHaveBeenCalled()

      adminQueriesMock.deleteUser.mockRejectedValueOnce(new Error('db crash'))
      await expectHttp(service.deleteUserOrGuest(10, 'john', { deleteSpace: false } as any))
    })

    it('deleteGuest -> getGuest then delete', async () => {
      setGuest({ id: 77, login: 'g77' } as any)
      adminQueriesMock.deleteUser.mockResolvedValueOnce(true)
      fs.isPathExists.mockResolvedValueOnce(false)
      await expect(service.deleteGuest(77)).resolves.toBeUndefined()
      expect(adminQueriesMock.deleteUser).toHaveBeenCalledWith(77, 'g77')
    })
  })

  describe('deleteUserFromAdmin', () => {
    it('admin password incorrect / deletion ok', async () => {
      const admin = new UserModel({ id: 1 } as any, true)
      adminQueriesMock.usersQueries.compareUserPassword.mockResolvedValueOnce(false)
      await expectHttp(service.deleteUserFromAdmin(admin, 10, { adminPassword: 'bad' } as AdminDeleteUserDto))

      adminQueriesMock.usersQueries.compareUserPassword.mockResolvedValueOnce(true)
      adminQueriesMock.usersQueries.from.mockResolvedValueOnce({ id: 10, login: 'to-del' } as any)
      adminQueriesMock.deleteUser.mockResolvedValueOnce(true)
      await service.deleteUserFromAdmin(admin, 10, { adminPassword: 'ok', deleteSpace: true } as any)
      expect(adminQueriesMock.deleteUser).toHaveBeenCalledWith(10, 'to-del')
    })
  })

  describe('groups', () => {
    it('browseGroups with/without name + NOT_FOUND', async () => {
      adminQueriesMock.groupFromName.mockResolvedValueOnce({ id: 5, name: 'dev', type: GROUP_TYPE.USER })
      adminQueriesMock.browseGroupMembers.mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
      const withName = await service.browseGroups('dev', GROUP_TYPE.USER)
      expect(withName.parentGroup).toEqual({ id: 5, name: 'dev', type: GROUP_TYPE.USER })
      expect(withName.members).toHaveLength(2)

      adminQueriesMock.browseRootGroupMembers.mockResolvedValueOnce([{ id: 3 }])
      const root = await service.browseGroups(undefined, GROUP_TYPE.USER)
      expect(root.parentGroup).toBeUndefined()
      expect(root.members).toEqual([{ id: 3 }])

      adminQueriesMock.groupFromName.mockResolvedValueOnce(null)
      await expectHttp(service.browseGroups('unknown'))
    })

    it('getGroup OK / NOT_FOUND', async () => {
      adminQueriesMock.groupFromId.mockResolvedValueOnce({ id: 9 })
      expect(await service.getGroup(9)).toEqual({ id: 9 })
      adminQueriesMock.groupFromId.mockResolvedValueOnce(null)
      await expectHttp(service.getGroup(999))
    })

    it('createGroup OK + validations + creation error', async () => {
      const dto: CreateOrUpdateGroupDto = { name: 'team', type: GROUP_TYPE.USER } as any
      adminQueriesMock.usersQueries.checkGroupNameExists.mockResolvedValueOnce(false)
      adminQueriesMock.createGroup.mockResolvedValueOnce(123)
      adminQueriesMock.groupFromId.mockResolvedValueOnce({ id: 123, name: 'team' })
      expect(await service.createGroup(dto)).toEqual({ id: 123, name: 'team' })

      await expectHttp(service.createGroup({} as any))

      adminQueriesMock.usersQueries.checkGroupNameExists.mockResolvedValueOnce(true)
      await expectHttp(service.createGroup(dto))
      expect(adminQueriesMock.createGroup).toHaveBeenCalledTimes(1) // only the first one OK

      adminQueriesMock.usersQueries.checkGroupNameExists.mockResolvedValueOnce(false)
      adminQueriesMock.createGroup.mockRejectedValueOnce(new Error('db err'))
      await expectHttp(service.createGroup(dto))
    })

    it('updateGroup success / failure', async () => {
      adminQueriesMock.usersQueries.checkGroupNameExists.mockResolvedValueOnce(false)
      adminQueriesMock.updateGroup.mockResolvedValueOnce(true)
      adminQueriesMock.groupFromId.mockResolvedValueOnce({ id: 5, name: 'new' })
      expect(await service.updateGroup(5, { name: 'new' } as any)).toEqual({ id: 5, name: 'new' })

      adminQueriesMock.updateGroup.mockResolvedValueOnce(false)
      await expectHttp(service.updateGroup(5, {} as any))
    })

    it('deleteGroup success / fail', async () => {
      adminQueriesMock.deleteGroup.mockResolvedValueOnce(true)
      await expect(service.deleteGroup(5)).resolves.toBeUndefined()
      adminQueriesMock.deleteGroup.mockResolvedValueOnce(false)
      await expectHttp(service.deleteGroup(6))
    })

    it('addUsersToGroup: NOT_FOUND + error', async () => {
      adminQueriesMock.groupFromId.mockResolvedValueOnce(null)
      await expectHttp(service.addUsersToGroup(1, [2, 3]))

      adminQueriesMock.groupFromId.mockResolvedValueOnce({ id: 1, type: GROUP_TYPE.USER })
      adminQueriesMock.addUsersToGroup.mockRejectedValueOnce(new Error('bad users'))
      await expectHttp(service.addUsersToGroup(1, [2]))
    })

    it('updateUserFromGroup / removeUserFromGroup BAD_REQUEST errors', async () => {
      adminQueriesMock.updateUserFromGroup.mockRejectedValueOnce(new Error('bad role'))
      await expectHttp(service.updateUserFromGroup(1, 2, { role: USER_GROUP_ROLE.MEMBER } as UpdateUserFromGroupDto))

      adminQueriesMock.removeUserFromGroup.mockRejectedValueOnce(new Error('not member'))
      await expectHttp(service.removeUserFromGroup(1, 2))
    })
  })

  describe('searchMembers', () => {
    it('forwards to usersQueries.searchUsersOrGroups', async () => {
      const dto = { search: 'jo' } as SearchMembersDto
      adminQueriesMock.usersQueries.searchUsersOrGroups.mockResolvedValueOnce([{ id: 1 }])
      expect(await service.searchMembers(dto)).toEqual([{ id: 1 }])
      expect(adminQueriesMock.usersQueries.searchUsersOrGroups).toHaveBeenCalledWith(dto)
    })
  })

  describe('impersonation', () => {
    const res: any = {}
    it('self / bad password / ok + logout (guard + non-admin + admin)', async () => {
      const admin = new UserModel({ id: 5 } as any, true)
      await expectHttp(service.impersonateUser(admin, 5, { password: 'x' } as UserPasswordDto, res))

      adminQueriesMock.usersQueries.compareUserPassword.mockResolvedValueOnce(false)
      await expectHttp(service.impersonateUser(admin, 6, { password: 'bad' } as any, res))

      const admin2 = new UserModel({ id: 5, clientId: 'c1' } as any, true)
      adminQueriesMock.usersQueries.compareUserPassword.mockResolvedValueOnce(true)
      adminQueriesMock.usersQueries.from.mockResolvedValueOnce({ id: 6, login: 'user' } as any)
      authManagerMock.setCookies.mockResolvedValueOnce({ accessToken: 't' })
      expect(await service.impersonateUser(admin2, 6, { password: 'ok' } as any, res)).toEqual({ accessToken: 't' })

      const notImpersonated = new UserModel({ id: 1 } as any, true)
      await expectHttp(service.logoutImpersonateUser(notImpersonated, res))

      const impersonated = new UserModel({ id: 2, impersonatedFromId: 9, impersonatedClientId: 'X' } as any, true)
      adminQueriesMock.usersQueries.from.mockResolvedValueOnce({ id: 9, role: USER_ROLE.USER } as any)
      await expectHttp(service.logoutImpersonateUser(impersonated, res))

      adminQueriesMock.usersQueries.from.mockResolvedValueOnce({ id: 9, role: USER_ROLE.ADMINISTRATOR } as any)
      authManagerMock.setCookies.mockResolvedValueOnce({ accessToken: 'admin' })
      expect(await service.logoutImpersonateUser(impersonated, res)).toEqual({ accessToken: 'admin' })
    })
  })

  describe('listing', () => {
    it('forwards listUsers and listGuests', async () => {
      const users = [{ id: 1 }]
      adminQueriesMock.listUsers.mockResolvedValueOnce(users as any)
      expect(await service.listUsers()).toEqual(users)
      expect(adminQueriesMock.listUsers).toHaveBeenCalledWith()

      const guests = [{ id: 2 }]
      adminQueriesMock.usersQueries.listGuests.mockResolvedValueOnce(guests as any)
      expect(await service.listGuests()).toEqual(guests)
      expect(adminQueriesMock.usersQueries.listGuests).toHaveBeenCalledWith(null, null, true)
    })
  })

  describe('createGuest', () => {
    it('adds the creator as default manager and returns admin guest', async () => {
      const creator = new UserModel({ id: 88 } as any, true)
      const dto: CreateUserDto = { login: 'gg', email: 'g@x', password: 'pwd', managers: [] } as any
      adminQueriesMock.usersQueries.checkUserExists.mockResolvedValueOnce(false)
      adminQueriesMock.usersQueries.createUserOrGuest.mockResolvedValueOnce(505)
      spyMakePaths()
      const expectedGuest = { id: 505, login: 'gg', role: USER_ROLE.GUEST }
      setGuest(expectedGuest as any)

      expect(await service.createGuest(creator, dto)).toEqual(expectedGuest)
      expect(adminQueriesMock.usersQueries.createUserOrGuest).toHaveBeenCalledWith(
        expect.objectContaining({ login: 'gg', email: 'g@x', managers: [88] }),
        USER_ROLE.GUEST
      )
    })
  })

  describe('updateGuest wrapper', () => {
    it('updateGuest() -> success', async () => {
      const guest = { id: 33, login: 'g', email: 'g@x', managers: [{ id: 2 }], role: USER_ROLE.GUEST }
      const updatedGuest = { ...guest, email: 'new@x' }
      setGuest(guest as any)
      adminQueriesMock.usersQueries.updateUserOrGuest.mockResolvedValueOnce(true)
      setGuest(updatedGuest as any)
      expect(await service.updateGuest(guest.id, { email: 'new@x' } as any)).toEqual(updatedGuest)
    })
  })

  describe('deleteUserSpace', () => {
    it('space not existing / removeFiles failure', async () => {
      fs.isPathExists.mockResolvedValueOnce(false)
      await expect(service.deleteUserSpace('nobody')).resolves.toBeUndefined()

      fs.isPathExists.mockResolvedValueOnce(true)
      fs.removeFiles.mockRejectedValueOnce(new Error('fs error'))
      await expectHttp(service.deleteUserSpace('bob'))
    })
  })

  describe('renameUserSpace error handling', () => {
    it('moveFiles throws then restore', async () => {
      const current = { ...baseUser }
      setUser(current)
      adminQueriesMock.usersQueries.checkUserExists.mockResolvedValueOnce(false)
      fs.isPathExists.mockResolvedValueOnce(true)
      fs.isPathExists.mockResolvedValueOnce(false)
      fs.moveFiles.mockRejectedValueOnce(new Error('io error'))
      fs.moveFiles.mockResolvedValueOnce(undefined)
      await expectHttp(service.updateUserOrGuest(current.id, { login: 'new-login' } as any))
      expect(fs.moveFiles).toHaveBeenCalledTimes(2)
    })

    it('current space missing -> early return', async () => {
      const current = { ...baseUser }
      setUser(current)
      adminQueriesMock.usersQueries.checkUserExists.mockResolvedValueOnce(false)
      fs.isPathExists.mockResolvedValueOnce(false)
      await expectHttp(service.updateUserOrGuest(current.id, { login: 'new-login' } as any))
      expect(fs.moveFiles).not.toHaveBeenCalled()
    })
  })
})
