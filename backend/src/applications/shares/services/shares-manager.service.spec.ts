/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpException, HttpStatus } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import * as commonFunctions from '../../../common/functions'
import { ContextManager } from '../../../infrastructure/context/services/context-manager.service'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants'
import { LINK_TYPE } from '../../links/constants/links'
import { LinksQueries } from '../../links/services/links-queries.service'
import { NotificationsManager } from '../../notifications/services/notifications-manager.service'
import { SpacesQueries } from '../../spaces/services/spaces-queries.service'
import * as permissionsUtils from '../../spaces/utils/permissions'
import { GUEST_PERMISSION } from '../../users/constants/user'
import { UsersQueries } from '../../users/services/users-queries.service'
import { SHARE_ALL_OPERATIONS } from '../constants/shares'
import { SharesManager } from './shares-manager.service'
import { SharesQueries } from './shares-queries.service'

// Mock classes and utility modules used by SharesManager
jest.mock('../../spaces/models/space-env.model', () => ({
  SpaceEnv: jest.fn().mockImplementation(() => ({
    setPermissions: jest.fn(),
    envPermissions: 'ENV_PERMS'
  }))
}))

jest.mock('../../spaces/utils/permissions', () => ({
  havePermission: jest.fn(),
  haveSpacePermission: jest.fn(),
  removePermissions: jest.fn(() => 'trimmed')
}))

jest.mock('../../../common/functions', () => {
  const actual = jest.requireActual('../../../common/functions')
  return {
    ...actual,
    generateShortUUID: jest.fn(),
    hashPassword: jest.fn(),
    intersectPermissions: jest.fn()
  }
})

describe(SharesManager.name, () => {
  let service: SharesManager

  // Mocks
  const contextManagerMock = {
    get: jest.fn()
  }

  const notificationsManagerMock = {
    create: jest.fn().mockResolvedValue(undefined),
    sendEmailNotification: jest.fn().mockResolvedValue(undefined)
  }

  const spacesQueriesMock = {
    permissions: jest.fn()
  }

  const usersQueriesMock = {
    createUserOrGuest: jest.fn(),
    deleteGuestLink: jest.fn(),
    usersWhitelist: jest.fn().mockResolvedValue([]),
    groupsWhitelist: jest.fn().mockResolvedValue([]),
    allUserIdsFromGroupsAndSubGroups: jest.fn().mockResolvedValue([])
  }

  const linksQueriesMock = {
    isUniqueUUID: jest.fn(),
    isReservedUUID: jest.fn(),
    allLinksFromSpaceOrShare: jest.fn(),
    createLinkToSpaceOrShare: jest.fn(),
    updateLinkFromSpaceOrShare: jest.fn(),
    linkFromShare: jest.fn(),
    linkFromSpace: jest.fn()
  }

  const sharesQueriesMock = {
    permissions: jest.fn(),
    listShareLinks: jest.fn(),
    getShareWithMembers: jest.fn(),
    createShare: jest.fn(),
    updateShare: jest.fn(),
    selectShares: jest.fn(),
    deleteShare: jest.fn(),
    updateMember: jest.fn(),
    updateMembers: jest.fn(),
    shareExistsForOwner: jest.fn(),
    childExistsForShareOwner: jest.fn()
  }

  const user = { id: 1, isAdmin: false } as any

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: DB_TOKEN_PROVIDER, useValue: {} },
        { provide: ContextManager, useValue: contextManagerMock },
        { provide: NotificationsManager, useValue: notificationsManagerMock },
        { provide: SpacesQueries, useValue: spacesQueriesMock },
        { provide: UsersQueries, useValue: usersQueriesMock },
        { provide: LinksQueries, useValue: linksQueriesMock },
        { provide: SharesQueries, useValue: sharesQueriesMock },
        SharesManager
      ]
    }).compile()

    module.useLogger(['fatal'])
    service = module.get<SharesManager>(SharesManager)
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('setAllowedPermissions', () => {
    it('sets all operations when the user is the file owner (personal space case)', async () => {
      const share: any = { file: { ownerId: user.id, permissions: '' } }
      await service.setAllowedPermissions(user, share)
      expect(share.file.permissions).toBe(SHARE_ALL_OPERATIONS)
    })

    it('uses space permissions when file has a space alias', async () => {
      spacesQueriesMock.permissions.mockResolvedValueOnce({ any: 'thing' })
      const share: any = {
        file: { ownerId: 999, space: { alias: 'space-1', root: { alias: 'root' } }, permissions: undefined }
      }
      await service.setAllowedPermissions(user, share)
      expect(spacesQueriesMock.permissions).toHaveBeenCalledWith(user.id, 'space-1', 'root')
      expect(share.file.ownerId).toBeNull()
      expect(share.file.permissions).toBe('ENV_PERMS')
    })

    it('uses parent share permissions when parent alias is present', async () => {
      sharesQueriesMock.permissions.mockResolvedValueOnce({ permissions: 'PARENT_PERMS' })
      const share: any = {
        ownerId: 77,
        parent: { alias: 'parent-share' },
        file: { permissions: undefined }
      }
      await service.setAllowedPermissions(user, share)
      expect(sharesQueriesMock.permissions).toHaveBeenCalledWith(user.id, 'parent-share', +user.isAdmin)
      expect(share.file.permissions).toBe('PARENT_PERMS')
    })

    it('throws Bad Request when missing required information', async () => {
      const share: any = { file: {}, parent: {} }
      await expect(service.setAllowedPermissions(user, share)).rejects.toEqual(new HttpException('Missing information', HttpStatus.BAD_REQUEST))
    })
  })

  describe('getShareWithMembers', () => {
    it('returns the share and calls setAllowedPermissions', async () => {
      const share: any = { id: 10, file: {} }
      sharesQueriesMock.getShareWithMembers.mockResolvedValueOnce(share)
      const spy = jest.spyOn(service, 'setAllowedPermissions').mockResolvedValueOnce(void 0)

      const result = await service.getShareWithMembers(user, 10, true)

      expect(result).toBe(share)
      expect(spy).toHaveBeenCalledWith(user, share, true)
    })

    it('throws Forbidden when share is not found or not authorized', async () => {
      sharesQueriesMock.getShareWithMembers.mockResolvedValueOnce(null)
      await expect(service.getShareWithMembers(user, 99, false)).rejects.toEqual(new HttpException('Not authorized', HttpStatus.FORBIDDEN))
    })
  })

  describe('generateLinkUUID', () => {
    it('loops until a unique UUID is found', async () => {
      ;(commonFunctions.generateShortUUID as jest.Mock).mockReturnValueOnce('aaa').mockReturnValueOnce('bbb')

      linksQueriesMock.isUniqueUUID.mockResolvedValueOnce(false).mockResolvedValueOnce(true)

      const { uuid } = await service.generateLinkUUID(user.id)

      expect(linksQueriesMock.isUniqueUUID).toHaveBeenCalledTimes(2)
      expect(linksQueriesMock.isUniqueUUID).toHaveBeenNthCalledWith(1, user.id, 'aaa')
      expect(linksQueriesMock.isUniqueUUID).toHaveBeenNthCalledWith(2, user.id, 'bbb')
      expect(uuid).toBe('bbb')
    })
  })

  describe('getShareLink', () => {
    it('returns the share link and trims unsupported permissions', async () => {
      const shareLink: any = { id: 5, file: { permissions: 'ORIG' } }
      sharesQueriesMock.listShareLinks.mockResolvedValueOnce(shareLink)
      const spy = jest.spyOn(service, 'setAllowedPermissions').mockResolvedValueOnce(void 0)

      const result = await service.getShareLink(user, 5)

      expect(spy).toHaveBeenCalledWith(user, shareLink)
      expect(result).toBe(shareLink)
      expect(result.file.permissions).toBe('trimmed')
      expect((permissionsUtils.removePermissions as jest.Mock).mock.calls[0][0]).toBe('ORIG')
    })

    it('throws Forbidden when link is not found', async () => {
      sharesQueriesMock.listShareLinks.mockResolvedValueOnce(null)
      await expect(service.getShareLink(user, 123)).rejects.toEqual(new HttpException('Not authorized', HttpStatus.FORBIDDEN))
    })
  })

  describe('updateLinkFromSpaceOrShare (from API)', () => {
    it('intersects permissions and returns updated link object', async () => {
      const baseLink: any = {
        id: 42,
        name: 'old',
        email: 'x@x',
        requireAuth: false,
        limitAccess: null,
        expiresAt: null,
        permissions: 'OLD',
        shareName: 'OldShare',
        shareDescription: 'OldDesc'
      }
      jest.spyOn(service, 'getLinkFromSpaceOrShare').mockResolvedValueOnce(baseLink)
      jest.spyOn(service, 'getShareLink').mockResolvedValueOnce({ file: { permissions: 'SHARE_PERMS' } } as any)
      ;(commonFunctions.intersectPermissions as jest.Mock).mockReturnValue('INTERSECTED')
      linksQueriesMock.updateLinkFromSpaceOrShare.mockResolvedValueOnce(undefined)

      const dto: any = {
        permissions: 'NEW_PERMS',
        language: 'fr',
        isActive: false
      }

      const result = await service.updateLinkFromSpaceOrShare(user, 7, 55, 1 as any, dto, true)

      expect(linksQueriesMock.updateLinkFromSpaceOrShare).toHaveBeenCalled()
      expect(result.permissions).toBe('INTERSECTED')
      expect(result.language).toBe('fr')
      expect(result.isActive).toBe(false)
    })
  })

  describe('createGuestLink', () => {
    it('creates guest link with hashed password and returns created user info', async () => {
      ;(commonFunctions.hashPassword as jest.Mock).mockResolvedValue('HASHED')
      ;(commonFunctions.generateShortUUID as jest.Mock).mockReturnValue('RANDOMSEQ')
      usersQueriesMock.createUserOrGuest.mockResolvedValueOnce(99)

      const guest = await service.createGuestLink(GUEST_PERMISSION.SHARES, 'plaintext', 'en', true)

      expect(usersQueriesMock.createUserOrGuest).toHaveBeenCalled()
      expect(guest.id).toBe(99)
      expect(guest.password).toBe('HASHED')
      expect(guest.role).toBeDefined()
      expect(guest.permissions).toBe(GUEST_PERMISSION.SHARES)
      expect(guest.language).toBe('en')
      expect(guest.isActive).toBe(true)
    })

    it('generates a random password and defaults isActive when not provided', async () => {
      ;(commonFunctions.hashPassword as jest.Mock).mockResolvedValue('HASHED-RAND')
      ;(commonFunctions.generateShortUUID as jest.Mock).mockReturnValueOnce('RANDOMSEQ')
      usersQueriesMock.createUserOrGuest.mockResolvedValueOnce(123)

      const guest = await service.createGuestLink(GUEST_PERMISSION.SPACES)

      expect(commonFunctions.hashPassword).toHaveBeenCalled()
      expect(guest.id).toBe(123)
      expect(guest.isActive).toBe(true)
      expect(guest.language).toBeNull()
    })
  })

  describe('getLinkFromSpaceOrShare', () => {
    it('returns a link guest for SPACE type', async () => {
      const lg = { id: 1 }
      linksQueriesMock.linkFromSpace.mockResolvedValueOnce(lg)

      const res = await service.getLinkFromSpaceOrShare(user, 11, 22, LINK_TYPE.SPACE)

      expect(res).toBe(lg)
      expect(linksQueriesMock.linkFromSpace).toHaveBeenCalledWith(user.id, 11, 22)
      expect(linksQueriesMock.linkFromShare).not.toHaveBeenCalled()
    })

    it('returns a link guest for SHARE type', async () => {
      const lg = { id: 2 }
      linksQueriesMock.linkFromShare.mockResolvedValueOnce(lg)

      const res = await service.getLinkFromSpaceOrShare(user, 33, 44, LINK_TYPE.SHARE)

      expect(res).toBe(lg)
      expect(linksQueriesMock.linkFromShare).toHaveBeenCalledWith(user.id, 33, 44, +user.isAdmin)
      expect(linksQueriesMock.linkFromSpace).not.toHaveBeenCalled()
    })

    it('throws when link not found', async () => {
      linksQueriesMock.linkFromSpace.mockResolvedValueOnce(null)

      await expect(service.getLinkFromSpaceOrShare(user, 55, 66, LINK_TYPE.SPACE)).rejects.toEqual(
        new HttpException('Link not found', HttpStatus.NOT_FOUND)
      )
    })
  })

  describe('updateLinkFromSpaceOrShare (additional branches)', () => {
    it('returns null when no diff and not from API', async () => {
      const link: any = { id: 1, name: 'n', email: 'e', requireAuth: false, limitAccess: null, expiresAt: null }
      jest.spyOn(service, 'getLinkFromSpaceOrShare').mockResolvedValueOnce(link)

      const result = await service.updateLinkFromSpaceOrShare(user, 1, 2, LINK_TYPE.SHARE, {}, false)

      expect(result).toBeNull()
      expect(linksQueriesMock.updateLinkFromSpaceOrShare).not.toHaveBeenCalled()
    })

    it('hashes password and does not leak it when fromAPI is true', async () => {
      const link: any = { id: 1 }
      jest.spyOn(service, 'getLinkFromSpaceOrShare').mockResolvedValueOnce(link)
      ;(commonFunctions.hashPassword as jest.Mock).mockResolvedValueOnce('HASHED')
      ;(linksQueriesMock.updateLinkFromSpaceOrShare as jest.Mock).mockImplementation(async (_link: any, _spaceOrShareId: number, updateUser: any) => {
        // Assert at call time before the service deletes the password
        expect(updateUser).toMatchObject({ password: 'HASHED' })
        return
      })

      const result = await service.updateLinkFromSpaceOrShare(user, 1, 2, LINK_TYPE.SHARE, { password: 'secret' }, true)

      expect(linksQueriesMock.updateLinkFromSpaceOrShare).toHaveBeenCalled()
      // The returned link must not leak password
      expect(result).toBe(link)
      expect((result as any).password).toBeUndefined()
    })

    it('updates multiple link/user fields and ignores equal expiresAt', async () => {
      const base = {
        id: 9,
        name: 'a',
        email: 'b',
        requireAuth: false,
        limitAccess: null,
        expiresAt: { date: '2025-01-01' }
      }
      jest.spyOn(service, 'getLinkFromSpaceOrShare').mockResolvedValueOnce(base as any)
      linksQueriesMock.updateLinkFromSpaceOrShare.mockResolvedValueOnce(undefined)

      const dto = {
        name: 'a2',
        email: 'b2',
        requireAuth: true,
        limitAccess: 5,
        expiresAt: { date: '2025-01-01' } // equal, should be ignored
      }

      await service.updateLinkFromSpaceOrShare(user, 9, 99, LINK_TYPE.SHARE, dto as any, false)

      const [, , , updateLink] = (linksQueriesMock.updateLinkFromSpaceOrShare as jest.Mock).mock.calls[0].slice(0, 5)
      expect(updateLink).toMatchObject({
        name: 'a2',
        email: 'b2',
        requireAuth: true,
        limitAccess: 5
      })
      expect(updateLink.expiresAt).toBeUndefined()
    })
  })

  describe('setAllowedPermissions (additional branches)', () => {
    it('sets all operations when share has externalPath and user is admin', async () => {
      const admin = { id: 10, isAdmin: true } as any
      const share: any = { externalPath: '/ext', file: {} }
      await service.setAllowedPermissions(admin, share)
      expect(share.file.permissions).toBe(SHARE_ALL_OPERATIONS)
    })

    it('throws NOT_FOUND when space permissions are missing', async () => {
      spacesQueriesMock.permissions.mockResolvedValueOnce(null)
      const share: any = { file: { space: { alias: 'space-x', root: { alias: 'r' } } } }

      await expect(service.setAllowedPermissions(user, share)).rejects.toEqual(new HttpException('Space not found', HttpStatus.NOT_FOUND))
    })

    it('throws NOT_FOUND when parent share permissions are missing', async () => {
      sharesQueriesMock.permissions.mockResolvedValueOnce(null)
      const share: any = { ownerId: 42, parent: { alias: 'parent' }, file: {} }

      await expect(service.setAllowedPermissions(user, share)).rejects.toEqual(new HttpException('Share not found', HttpStatus.NOT_FOUND))
    })

    it('uses owner permissions when asAdmin is true', async () => {
      const asAdminUser = { id: 3, isAdmin: false } as any
      sharesQueriesMock.permissions.mockResolvedValueOnce({ permissions: 'ADMIN_PARENT' })
      const share: any = { ownerId: 77, parent: { alias: 'pa' }, file: {} }

      await service.setAllowedPermissions(asAdminUser, share, true)

      expect(sharesQueriesMock.permissions).toHaveBeenCalledWith(77, 'pa', +asAdminUser.isAdmin)
      expect(share.file.permissions).toBe('ADMIN_PARENT')
    })
  })

  describe('getShareLink (additional branch)', () => {
    it('does not trim permissions if file.permissions is falsy', async () => {
      const shareLink: any = { id: 7, file: {} }
      sharesQueriesMock.listShareLinks.mockResolvedValueOnce(shareLink)
      const spy = jest.spyOn(service, 'setAllowedPermissions').mockResolvedValueOnce(void 0)

      const res = await service.getShareLink(user, 7)

      expect(spy).toHaveBeenCalled()
      expect(res).toBe(shareLink)
      expect(permissionsUtils.removePermissions).not.toHaveBeenCalled()
    })
  })

  describe('deleteShare', () => {
    it('throws Forbidden when user is not admin and not owner', async () => {
      sharesQueriesMock.shareExistsForOwner.mockResolvedValueOnce(false)

      await expect(service.deleteShare({ id: 2, isAdmin: false } as any, 123)).rejects.toEqual(
        new HttpException('Not authorized', HttpStatus.FORBIDDEN)
      )
    })

    it('deletes links and removes shares when authorized (asAdmin)', async () => {
      const deleteLinksSpy = jest.spyOn(service, 'deleteAllLinkMembers').mockResolvedValue(void 0)
      const removeSpy = jest.spyOn<any, any>(service as any, 'removeShareFromOwners').mockResolvedValue(void 0)

      await service.deleteShare(user, 456, true)

      expect(deleteLinksSpy).toHaveBeenCalledWith(456, expect.anything())
      expect(removeSpy).toHaveBeenCalledWith(456, 'all', false, user.id)
    })
  })

  describe('child share wrappers', () => {
    it('getChildShare returns share link when isLink = true', async () => {
      sharesQueriesMock.childExistsForShareOwner.mockResolvedValueOnce(99)
      const getShareLinkSpy = jest.spyOn(service, 'getShareLink').mockResolvedValueOnce({ id: 99 } as any)

      const res = await service.getChildShare(user, 1, 99, true)
      expect(res).toEqual({ id: 99 })
      expect(getShareLinkSpy).toHaveBeenCalledWith(user, 99, true)
    })

    it('getChildShare returns child share when isLink = false', async () => {
      sharesQueriesMock.childExistsForShareOwner.mockResolvedValueOnce(100)
      const getShareSpy = jest.spyOn(service, 'getShareWithMembers').mockResolvedValueOnce({ id: 100 } as any)

      const res = await service.getChildShare(user, 1, 100, false)
      expect(res).toEqual({ id: 100 })
      expect(getShareSpy).toHaveBeenCalledWith(user, 100, true)
    })

    it('updateChildShare forwards update and deleteChildShare forwards delete', async () => {
      sharesQueriesMock.childExistsForShareOwner.mockResolvedValue(200)
      const updateSpy = jest.spyOn(service, 'updateShare').mockResolvedValueOnce({ id: 200 } as any)
      const deleteSpy = jest.spyOn(service, 'deleteShare').mockResolvedValueOnce(void 0)

      await service.updateChildShare(user, 1, 200, {} as any)
      expect(updateSpy).toHaveBeenCalledWith(user, 200, {} as any, true)

      await service.deleteChildShare(user, 1, 200)
      expect(deleteSpy).toHaveBeenCalledWith(user, 200, true)
    })

    it('throws Forbidden when not allowed to manage child share', async () => {
      sharesQueriesMock.childExistsForShareOwner.mockResolvedValueOnce(null)
      await expect(service.getChildShare(user, 1, 2, false)).rejects.toEqual(new HttpException('Not authorized', HttpStatus.FORBIDDEN))
    })
  })

  describe('createOrUpdateLinksAsMembers', () => {
    it('creates new links for id < 0 and notifies guest', async () => {
      const createLinkSpy = jest.spyOn<any, any>(service as any, 'createLinkFromSpaceOrShare').mockResolvedValue(void 0)
      const notifySpy = jest.spyOn<any, any>(service as any, 'notifyGuestLink').mockResolvedValue(void 0)

      const links = [{ id: -1, linkSettings: { uuid: 'u', email: 'e', permissions: 'p' }, permissions: 'p' }] as any

      const res = await service.createOrUpdateLinksAsMembers(user, { id: 1, name: 'S' } as any, LINK_TYPE.SHARE, links)

      expect(res).toEqual([])
      expect(createLinkSpy).toHaveBeenCalled()
      expect(notifySpy).toHaveBeenCalled()
    })

    it('updates modified links and returns them along with unmodified ones', async () => {
      const updateLinkSpy = jest.spyOn(service, 'updateLinkFromSpaceOrShare').mockResolvedValue(void 0)

      const members = await service.createOrUpdateLinksAsMembers(user, { id: 1, name: 'S' } as any, LINK_TYPE.SHARE, [
        { id: 2, linkId: 2, permissions: 'p', linkSettings: { name: 'new' } },
        { id: 3, linkId: 3, permissions: 'q' } // unmodified
      ] as any)

      expect(updateLinkSpy).toHaveBeenCalledWith(user, 2, 1, LINK_TYPE.SHARE, { name: 'new' })
      expect(members).toHaveLength(2)
      expect(members.map((m: any) => m.id)).toEqual([2, 3])
    })
  })

  describe('generateLinkUUID (additional)', () => {
    it('returns immediately when the first UUID is unique', async () => {
      ;(commonFunctions.generateShortUUID as jest.Mock).mockReturnValueOnce('only-one')
      linksQueriesMock.isUniqueUUID.mockResolvedValueOnce(true)

      const { uuid } = await service.generateLinkUUID(user.id)

      expect(uuid).toBe('only-one')
      expect(linksQueriesMock.isUniqueUUID).toHaveBeenCalledTimes(1)
      expect(linksQueriesMock.isUniqueUUID).toHaveBeenCalledWith(user.id, 'only-one')
    })
  })
})
