/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { createMock, DeepMocked } from '@golevelup/ts-jest'
import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { intersectPermissions } from '../../../common/shared'
import { Cache } from '../../../infrastructure/cache/services/cache.service'
import { ContextManager } from '../../../infrastructure/context/services/context-manager.service'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants'
import { API_FILES_ONLY_OFFICE_CALLBACK } from '../../files/constants/routes'
import { OnlyOfficeContext } from '../../files/decorators/only-office-environment.decorator'
import { FilesQueries } from '../../files/services/files-queries.service'
import { LinksQueries } from '../../links/services/links-queries.service'
import { NotificationsManager } from '../../notifications/services/notifications-manager.service'
import { SHARE_ALL_OPERATIONS } from '../../shares/constants/shares'
import { SharesManager } from '../../shares/services/shares-manager.service'
import { SharesQueries } from '../../shares/services/shares-queries.service'
import { SyncContext } from '../../sync/decorators/sync-context.decorator'
import { USER_PERMISSION, USER_ROLE } from '../../users/constants/user'
import { UserModel } from '../../users/models/user.model'
import { UsersQueries } from '../../users/services/users-queries.service'
import { generateUserTest } from '../../users/utils/test'
import { WebDAVContext } from '../../webdav/decorators/webdav-context.decorator'
import { SPACE_ALIAS, SPACE_ALL_OPERATIONS, SPACE_OPERATION, SPACE_PERMS_SEP, SPACE_REPOSITORY } from '../constants/spaces'
import { SkipSpaceGuard } from '../decorators/space-skip-guard.decorator'
import { SkipSpacePermissionsCheck } from '../decorators/space-skip-permissions.decorator'
import { SpaceEnv } from '../models/space-env.model'
import { SpacesManager } from '../services/spaces-manager.service'
import { SpacesQueries } from '../services/spaces-queries.service'
import { SpaceGuard } from './space.guard'

describe(SpaceGuard.name, () => {
  let spacesGuard: SpaceGuard
  let spacesManager: SpacesManager
  let spacesQueries: SpacesQueries
  let userTest: UserModel
  let context: DeepMocked<ExecutionContext>

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: DB_TOKEN_PROVIDER,
          useValue: {}
        },
        {
          provide: Cache,
          useValue: {}
        },
        { provide: ContextManager, useValue: {} },
        {
          provide: NotificationsManager,
          useValue: {}
        },
        SpaceGuard,
        SpacesManager,
        SpacesQueries,
        SharesManager,
        SharesQueries,
        FilesQueries,
        UsersQueries,
        LinksQueries
      ]
    }).compile()

    spacesManager = module.get<SpacesManager>(SpacesManager)
    spacesQueries = module.get<SpacesQueries>(SpacesQueries)
    spacesGuard = module.get<SpaceGuard>(SpaceGuard)
    // mocks
    spacesManager['setQuotaExceeded'] = jest.fn()
    userTest = new UserModel(generateUserTest())
    context = createMock<ExecutionContext>()
  })

  it('should be defined', () => {
    expect(spacesGuard).toBeDefined()
    expect(spacesManager).toBeDefined()
    expect(userTest).toBeDefined()
  })

  it('should pass for a personal space', async () => {
    context.switchToHttp().getRequest.mockReturnValue({
      user: userTest,
      params: { '*': 'files/personal/root/foo/bar' }
    })
    expect(await spacesGuard.canActivate(context)).toBe(true)
    const req: any = context.switchToHttp().getRequest()
    expect(req.space.id).toBe(0)
    expect(req.space.repository).toBe(SPACE_REPOSITORY.FILES)
    expect(req.space.alias).toBe(SPACE_ALIAS.PERSONAL)
    expect(req.space.name).toBe(SPACE_ALIAS.PERSONAL)
    expect(req.space.enabled).toBe(true)
    expect(req.space.root).toBeUndefined()
    expect(req.space.dbFile).toMatchObject({ inTrash: false, ownerId: userTest.id, path: 'root/foo/bar' })
    expect(req.space.permissions).toBe(SPACE_ALL_OPERATIONS)
    expect(req.space.envPermissions).toBe(SPACE_ALL_OPERATIONS)
    expect(req.space.inFilesRepository).toBe(true)
    expect(req.space.inPersonalSpace).toBe(true)
    expect(req.space.inTrashRepository).toBe(false)
    expect(req.space.inSharesRepository).toBe(false)
    expect(req.space.inSharesList).toBe(false)
    expect(req.space.paths).toEqual(expect.arrayContaining(['root', 'foo', 'bar']))
  })

  it('should pass for a common space', async () => {
    const fakeSpace = {
      id: -1,
      alias: 'test',
      name: 'Test',
      enabled: true,
      permissions: ':a:d:m:so',
      role: 0
    }
    spacesQueries.permissions = jest.fn().mockReturnValueOnce(fakeSpace)
    context.switchToHttp().getRequest.mockReturnValue({
      user: userTest,
      params: { '*': 'files/test' }
    })
    expect(await spacesGuard.canActivate(context)).toBe(true)
    const req: any = context.switchToHttp().getRequest()
    expect(req.space.id).toBe(fakeSpace.id)
    expect(req.space.repository).toBe(SPACE_REPOSITORY.FILES)
    expect(req.space.alias).toBe(fakeSpace.alias)
    expect(req.space.name).toBe(fakeSpace.name)
    expect(req.space.enabled).toBe(true)
    expect(req.space.root).toMatchObject({ id: 0, alias: '', name: '', permissions: 'a:d:m:so' })
    expect(req.space.dbFile).toMatchObject({ inTrash: false, spaceId: fakeSpace.id, spaceExternalRootId: null, path: '.' })
    expect(req.space.permissions).toBe(SHARE_ALL_OPERATIONS)
    expect(req.space.envPermissions).not.toContain('d')
    expect(req.space.inFilesRepository).toBe(true)
    expect(req.space.inPersonalSpace).toBe(false)
    expect(req.space.inTrashRepository).toBe(false)
    expect(req.space.inSharesRepository).toBe(false)
    expect(req.space.inSharesList).toBe(false)
    expect(req.space.paths).toHaveLength(0)
  })

  it('should pass for a common space root', async () => {
    const fakeSpace = {
      id: -1,
      alias: 'test',
      name: 'Test',
      enabled: true,
      permissions: 'a:d:m:so',
      role: 1,
      root: {
        id: -2,
        alias: 'root',
        name: 'Root',
        permissions: 'a:d:so',
        owner: { id: -3, login: 'johaven' },
        file: { id: -4, path: 'code', inTrash: false },
        externalPath: null
      }
    }
    spacesQueries.permissions = jest.fn().mockReturnValueOnce(fakeSpace)
    context.switchToHttp().getRequest.mockReturnValue({
      user: userTest,
      params: { '*': 'files/test/root' }
    })
    expect(await spacesGuard.canActivate(context)).toBe(true)
    const req: any = context.switchToHttp().getRequest()
    expect(req.space.id).toBe(fakeSpace.id)
    expect(req.space.repository).toBe(SPACE_REPOSITORY.FILES)
    expect(req.space.alias).toBe(fakeSpace.alias)
    expect(req.space.name).toBe(fakeSpace.name)
    expect(req.space.enabled).toBe(true)
    expect(req.space.root).toMatchObject(fakeSpace.root)
    expect(req.space.dbFile).toMatchObject({ inTrash: false, ownerId: fakeSpace.root.owner.id, path: fakeSpace.root.file.path })
    expect(req.space.permissions).toBe(SPACE_ALL_OPERATIONS)
    expect(req.space.envPermissions).toBe(
      intersectPermissions(fakeSpace.permissions, fakeSpace.root.permissions)
        .split(SPACE_PERMS_SEP)
        .filter((p) => p !== SPACE_OPERATION.DELETE)
        .join(SPACE_PERMS_SEP)
    )
    expect(req.space.inFilesRepository).toBe(true)
    expect(req.space.inPersonalSpace).toBe(false)
    expect(req.space.inTrashRepository).toBe(false)
    expect(req.space.inSharesRepository).toBe(false)
    expect(req.space.inSharesList).toBe(false)
    expect(req.space.paths).toHaveLength(0)
  })

  it('should pass for a common space root with a path', async () => {
    const fakeSpace = {
      id: -1,
      alias: 'test',
      name: 'Test',
      enabled: true,
      permissions: 'a:d:m:so',
      role: 1,
      root: {
        id: -2,
        alias: 'root',
        name: 'Root',
        permissions: 'a:d:so',
        owner: { id: -3, login: 'johaven' },
        file: { id: -4, path: 'code', inTrash: false },
        externalPath: null
      }
    }
    spacesQueries.permissions = jest.fn().mockReturnValueOnce(fakeSpace)
    context.switchToHttp().getRequest.mockReturnValue({
      user: userTest,
      params: { '*': 'files/test/root/path' }
    })
    expect(await spacesGuard.canActivate(context)).toBe(true)
    const req: any = context.switchToHttp().getRequest()
    expect(req.space.id).toBe(fakeSpace.id)
    expect(req.space.repository).toBe(SPACE_REPOSITORY.FILES)
    expect(req.space.alias).toBe(fakeSpace.alias)
    expect(req.space.name).toBe(fakeSpace.name)
    expect(req.space.enabled).toBe(true)
    expect(req.space.root).toMatchObject(fakeSpace.root)
    expect(req.space.dbFile).toMatchObject({
      inTrash: false,
      ownerId: fakeSpace.root.owner.id,
      path: `${fakeSpace.root.file.path}/${req.space.paths[0]}`
    })
    expect(req.space.permissions).toBe(SPACE_ALL_OPERATIONS)
    expect(req.space.envPermissions).toBe(fakeSpace.root.permissions)
    expect(req.space.inFilesRepository).toBe(true)
    expect(req.space.inPersonalSpace).toBe(false)
    expect(req.space.inTrashRepository).toBe(false)
    expect(req.space.inSharesRepository).toBe(false)
    expect(req.space.inSharesList).toBe(false)
    expect(req.space.paths).toHaveLength(1)
  })

  it('should pass for a space in shares repository', async () => {
    context.switchToHttp().getRequest.mockReturnValue({
      user: userTest,
      params: { '*': 'shares' }
    })
    expect(await spacesGuard.canActivate(context)).toBe(true)
    const req: any = context.switchToHttp().getRequest()
    expect(req.space.id).toBe(0)
    expect(req.space.repository).toBe(SPACE_REPOSITORY.SHARES)
    expect(req.space.alias).toBe(SPACE_REPOSITORY.SHARES)
    expect(req.space.name).toBe(SPACE_REPOSITORY.SHARES)
    expect(req.space.enabled).toBe(true)
    expect(req.space.root).toBeUndefined()
    expect(req.space.dbFile).toBeUndefined()
    expect(req.space.permissions).toBe('')
    expect(req.space.envPermissions).toBe('')
    expect(req.space.inFilesRepository).toBe(false)
    expect(req.space.inPersonalSpace).toBe(false)
    expect(req.space.inTrashRepository).toBe(false)
    expect(req.space.inSharesRepository).toBe(true)
    expect(req.space.inSharesList).toBe(true)
    expect(req.space.paths).toHaveLength(0)
  })

  it('should not pass if the space is not found or not valid', async () => {
    const fakeSpace = null
    spacesQueries.permissions = jest.fn().mockReturnValueOnce(fakeSpace)
    context.switchToHttp().getRequest.mockReturnValue({
      user: userTest,
      params: { '*': 'files/foo' }
    })
    await expect(spacesGuard.canActivate(context)).rejects.toThrow(HttpException)
  })

  it('should validate (or not) the access to the space depending on the user permissions', async () => {
    // we only check the `spacesManager.checkAccessToSpace` function, ignores the `spacesManager.spaceEnv`
    userTest.applications = [USER_PERMISSION.PERSONAL_SPACE]
    for (const url of ['', 'shares/personal', 'shares/toto']) {
      context.switchToHttp().getRequest.mockReturnValue({
        user: userTest,
        params: { '*': url }
      })
      await expect(spacesGuard.canActivate(context)).rejects.toThrow(HttpException)
    }
    // should pass because it is a standard user
    // should not pass because user is a guest (and dot not have the permission to access to a personal space)
    spacesManager.spaceEnv = jest.fn().mockReturnValueOnce({ enabled: true }) // only for user role
    context.switchToHttp().getRequest.mockReturnValue({
      user: userTest,
      params: { '*': 'files/personal/root/foo/bar' }
    })
    for (const userRole of [USER_ROLE.USER, USER_ROLE.GUEST]) {
      userTest.role = userRole
      if (userRole === USER_ROLE.USER) {
        expect(await spacesGuard.canActivate(context)).toBe(true)
      } else {
        await expect(spacesGuard.canActivate(context)).rejects.toThrow(HttpException)
      }
    }
  })

  it('should check user permissions on route', async () => {
    userTest.role = USER_ROLE.USER
    spacesManager.spaceEnv = jest.fn().mockReturnValue({
      enabled: true,
      envPermissions: `${SPACE_OPERATION.MODIFY}`
    } as Partial<SpaceEnv>)
    // does not allow creation (only modify)
    context.switchToHttp().getRequest.mockReturnValueOnce({
      method: 'POST',
      user: userTest,
      params: { '*': 'files/personal' }
    })
    await expect(spacesGuard.canActivate(context)).rejects.toThrow(HttpException)

    // allows modification
    context.switchToHttp().getRequest.mockReturnValue({
      method: 'PATCH',
      user: userTest,
      params: { '*': 'files/personal' }
    })
    expect(await spacesGuard.canActivate(context)).toBe(true)

    // does not allow guest (on personal space)
    userTest.role = USER_ROLE.GUEST
    await expect(spacesGuard.canActivate(context)).rejects.toThrow(HttpException)

    // allow if SkipSpacePermissionsCheck is enabled
    userTest.role = USER_ROLE.USER
    SkipSpacePermissionsCheck()(context.getHandler())
    spacesManager.spaceEnv = jest.fn().mockReturnValue({
      enabled: true,
      envPermissions: `${SPACE_OPERATION.MODIFY}`
    } as Partial<SpaceEnv>)
    // does not allow creation but pass
    context.switchToHttp().getRequest.mockReturnValueOnce({
      method: 'POST',
      user: userTest,
      params: { '*': 'files/personal' }
    })
    expect(await spacesGuard.canActivate(context)).toBe(true)
    // reset context
    context = createMock<ExecutionContext>()
  })

  it('should fail with quota exceeded', async () => {
    userTest.role = USER_ROLE.USER
    spacesManager.spaceEnv = jest.fn().mockReturnValueOnce({
      enabled: true,
      envPermissions: `${SPACE_OPERATION.ADD}`,
      quotaIsExceeded: true
    } as Partial<SpaceEnv>)
    context.switchToHttp().getRequest.mockReturnValueOnce({
      method: 'POST',
      user: userTest,
      params: { '*': 'files/personal' }
    })
    await expect(spacesGuard.canActivate(context)).rejects.toEqual(expect.objectContaining({ status: HttpStatus.INSUFFICIENT_STORAGE }))
  })

  it('should fail if request content-length header exceed the quota', async () => {
    userTest.role = USER_ROLE.USER
    const storageQuota = 12
    const storageUsage = 11
    spacesManager.spaceEnv = jest.fn().mockReturnValue({
      enabled: true,
      envPermissions: `${SPACE_OPERATION.ADD}`,
      storageQuota: storageQuota,
      storageUsage: storageUsage,
      willExceedQuota: (contentLength: number) => contentLength > storageQuota - storageUsage
    } as Partial<SpaceEnv>)
    context.switchToHttp().getRequest.mockReturnValueOnce({
      method: 'POST',
      headers: { 'content-length': 13 },
      user: userTest,
      params: { '*': 'files/personal' }
    })
    await expect(spacesGuard.canActivate(context)).rejects.toEqual(expect.objectContaining({ status: HttpStatus.INSUFFICIENT_STORAGE }))
    context.switchToHttp().getRequest.mockReturnValueOnce({
      method: 'POST',
      user: userTest,
      headers: {},
      params: { '*': 'files/personal' }
    })
    expect(await spacesGuard.canActivate(context)).toBe(true)
  })

  it('should fail with space disabled', async () => {
    userTest.role = USER_ROLE.USER
    spacesManager.spaceEnv = jest.fn().mockReturnValueOnce({
      enabled: false
    } as Partial<SpaceEnv>)
    context.switchToHttp().getRequest.mockReturnValueOnce({
      method: 'POST',
      user: userTest,
      params: { '*': 'files/personal' }
    })
    await expect(spacesGuard.canActivate(context)).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN })
  })

  it('should validate (or not) the webdav routes', async () => {
    userTest.role = USER_ROLE.USER
    spacesManager.spaceEnv = jest.fn().mockReturnValue({ enabled: true })
    const spyUrlSegment = jest.spyOn(spacesGuard as any, 'urlSegmentsFromContext')
    WebDAVContext()(context.getHandler())
    context.switchToHttp().getRequest.mockReturnValueOnce({
      user: userTest,
      params: { '*': 'webdav/personal' }
    })
    expect(await spacesGuard.canActivate(context)).toBe(true)
    expect(spyUrlSegment.mock.results[0].value).toEqual(['files', 'personal'])
    context.switchToHttp().getRequest.mockReturnValueOnce({
      user: userTest,
      params: { '*': 'webdav/files' }
    })
    await expect(spacesGuard.canActivate(context)).rejects.toThrow(HttpException)
    // reset context
    spyUrlSegment.mockRestore()
    context = createMock<ExecutionContext>()
  })

  it('should validate (or not) the sync routes', async () => {
    userTest.role = USER_ROLE.USER
    spacesManager.spaceEnv = jest.fn().mockReturnValue({ enabled: true })
    const spyUrlSegment = jest.spyOn(spacesGuard as any, 'urlSegmentsFromContext')
    SyncContext()(context.getHandler())
    context.switchToHttp().getRequest.mockReturnValueOnce({
      user: userTest,
      params: { '*': 'personal/foo' }
    })
    expect(await spacesGuard.canActivate(context)).toBe(true)
    expect(spyUrlSegment.mock.results[0].value).toEqual(['files', 'personal', 'foo'])
    context.switchToHttp().getRequest.mockReturnValueOnce({
      user: userTest,
      params: { '*': 'sync/files' }
    })
    await expect(spacesGuard.canActivate(context)).rejects.toThrow(HttpException)
    // reset context
    spyUrlSegment.mockRestore()
    context = createMock<ExecutionContext>()
  })

  it('should require the modify permission when using the POST method on the OnlyOffice callback URL', async () => {
    userTest.role = USER_ROLE.USER
    spacesManager.spaceEnv = jest.fn().mockReturnValue({ enabled: true, envPermissions: `${SPACE_OPERATION.MODIFY}` })
    OnlyOfficeContext()(context.getHandler())
    context.switchToHttp().getRequest.mockReturnValue({
      method: 'POST',
      user: userTest,
      originalUrl: API_FILES_ONLY_OFFICE_CALLBACK,
      params: { '*': 'files/personal/root' }
    })
    expect(await spacesGuard.canActivate(context)).toBe(true)
    spacesManager.spaceEnv = jest.fn().mockReturnValue({ enabled: true, envPermissions: `${SPACE_OPERATION.ADD}` })
    await expect(spacesGuard.canActivate(context)).rejects.toThrow(HttpException)
    context.switchToHttp().getRequest.mockReturnValue({
      method: 'POST',
      user: userTest,
      originalUrl: '',
      params: { '*': 'files/personal/root' }
    })
    expect(await spacesGuard.canActivate(context)).toBe(true)
    // reset context
    context = createMock<ExecutionContext>()
  })

  it('should pass if skipSpaceGuard context is enabled', async () => {
    userTest.role = USER_ROLE.USER
    userTest.applications = [USER_PERMISSION.PERSONAL_SPACE]
    spacesManager.spaceEnv = jest.fn().mockReturnValue({ enabled: true })
    context.switchToHttp().getRequest.mockReturnValue({
      user: userTest,
      params: { '*': 'shares/personal' }
    })
    await expect(spacesGuard.canActivate(context)).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN })
    SkipSpaceGuard()(context.getHandler())
    expect(await spacesGuard.canActivate(context)).toBe(true)
    // reset context
    context = createMock<ExecutionContext>()
  })

  it('coverage only', async () => {
    userTest.role = USER_ROLE.USER
    userTest.applications = [USER_PERMISSION.PERSONAL_SPACE]
    spacesManager.spaceEnv = jest.fn().mockRejectedValueOnce(new Error('error'))
    context.switchToHttp().getRequest.mockReturnValue({
      user: userTest,
      params: { '*': 'files/personal' }
    })
    await expect(spacesGuard.canActivate(context)).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST })
  })
})
