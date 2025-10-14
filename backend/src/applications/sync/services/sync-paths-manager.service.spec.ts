/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpStatus } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { currentTimeStamp } from '../../../common/shared'
import { ContextManager } from '../../../infrastructure/context/services/context-manager.service'
import { FilesQueries } from '../../files/services/files-queries.service'
import { getProps, isPathExists, isPathIsDir } from '../../files/utils/files'
import { NotificationsManager } from '../../notifications/services/notifications-manager.service'
import { SpacesManager } from '../../spaces/services/spaces-manager.service'
import { getEnvPermissions } from '../../spaces/utils/permissions'
import { UsersQueries } from '../../users/services/users-queries.service'
import { SyncPathsManager } from './sync-paths-manager.service'
import { SyncQueries } from './sync-queries.service'

// Mock modules used directly inside SyncPathsManager
jest.mock('../../../common/shared', () => ({
  currentTimeStamp: jest.fn(() => 1000)
}))
jest.mock('../../files/utils/files', () => ({
  isPathExists: jest.fn(),
  isPathIsDir: jest.fn(),
  getProps: jest.fn(),
  sanitizePath: jest.fn((p: string) => p)
}))
jest.mock('../../spaces/utils/permissions', () => ({
  getEnvPermissions: jest.fn(() => 'server-perms')
}))
jest.mock('../constants/sync', () => ({
  SYNC_PATH_REPOSITORY: {
    SPACES: ['spaces'],
    PERSONAL: ['personal'],
    SHARES: ['shares']
  }
}))
jest.mock('../../notifications/constants/notifications', () => ({
  NOTIFICATION_APP: { SYNC: 'SYNC' },
  NOTIFICATION_APP_EVENT: { SYNC: { DELETE: 'DELETE', CREATE: 'CREATE', UPDATE: 'UPDATE' } }
}))

describe(SyncPathsManager.name, () => {
  let service: SyncPathsManager
  let contextManager: { get: jest.Mock }
  let spacesManager: { spaceEnv: jest.Mock }
  let usersQueries: Record<string, jest.Mock>
  let filesQueries: { getSpaceFileId: jest.Mock; getOrCreateSpaceFile: jest.Mock }
  let notificationsManager: { create: jest.Mock }
  let syncQueries: {
    getClient: jest.Mock
    clientExistsForOwner: jest.Mock
    createPath: jest.Mock
    deletePath: jest.Mock
    getPaths: jest.Mock
    getPathSettings: jest.Mock
    updatePathSettings: jest.Mock
    clearCachePathSettings: jest.Mock
  }

  const userWith = (clientId?: string) => ({ id: 1, clientId })
  const flush = () => new Promise((r) => setImmediate(r))

  beforeEach(async () => {
    contextManager = { get: jest.fn(() => 'http://origin.local') }
    spacesManager = { spaceEnv: jest.fn() }
    usersQueries = {}
    filesQueries = {
      getSpaceFileId: jest.fn(),
      getOrCreateSpaceFile: jest.fn()
    }
    notificationsManager = {
      create: jest.fn().mockResolvedValue(undefined)
    }
    syncQueries = {
      getClient: jest.fn(),
      clientExistsForOwner: jest.fn(),
      createPath: jest.fn(),
      deletePath: jest.fn(),
      getPaths: jest.fn(),
      getPathSettings: jest.fn(),
      updatePathSettings: jest.fn().mockResolvedValue(undefined),
      clearCachePathSettings: jest.fn()
    }
    ;(isPathExists as jest.Mock).mockReset()
    ;(isPathIsDir as jest.Mock).mockReset()
    ;(getProps as jest.Mock).mockReset()
    ;(getEnvPermissions as jest.Mock).mockReset().mockReturnValue('server-perms')
    ;(currentTimeStamp as jest.Mock).mockReset().mockReturnValue(1000)

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncPathsManager,
        { provide: ContextManager, useValue: contextManager },
        { provide: SpacesManager, useValue: spacesManager },
        { provide: UsersQueries, useValue: usersQueries },
        { provide: FilesQueries, useValue: filesQueries },
        { provide: NotificationsManager, useValue: notificationsManager },
        { provide: SyncQueries, useValue: syncQueries }
      ]
    }).compile()

    module.useLogger(['fatal'])
    service = module.get<SyncPathsManager>(SyncPathsManager)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('createPath', () => {
    const baseReq = () =>
      ({
        user: { id: 1, clientId: 'client-1' },
        params: { '*': 'SPACES/alias/sub' },
        space: {
          realPath: '/real/path',
          quotaIsExceeded: false,
          root: { id: 1, alias: 'alias' },
          inFilesRepository: true,
          paths: ['sub'],
          dbFile: { ownerId: 1, path: '.' },
          id: 10
        }
      }) as any

    it('should throw BAD_REQUEST when client id is missing', async () => {
      const req = baseReq()
      req.user.clientId = undefined
      await expect(service.createPath(req, { remotePath: 'x' } as any)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Client id is missing'
      })
    })

    it('should throw INSUFFICIENT_STORAGE when storage quota is exceeded', async () => {
      const req = baseReq()
      req.space.quotaIsExceeded = true
      await expect(service.createPath(req, { remotePath: 'x' } as any)).rejects.toMatchObject({
        status: HttpStatus.INSUFFICIENT_STORAGE
      })
    })

    it.each([
      {
        title: 'NOT_FOUND when remote path does not exist',
        setup: () => (isPathExists as jest.Mock).mockResolvedValue(false),
        expected: { status: HttpStatus.NOT_FOUND, message: 'Remote path not found : client/remote' }
      },
      {
        title: 'BAD_REQUEST when remote path is not a directory',
        setup: () => ((isPathExists as jest.Mock).mockResolvedValue(true), (isPathIsDir as jest.Mock).mockResolvedValue(false)),
        expected: { status: HttpStatus.BAD_REQUEST, message: 'Remote path must be a directory' }
      },
      {
        title: 'NOT_FOUND when client is not found',
        setup: () => (
          (isPathExists as jest.Mock).mockResolvedValue(true),
          (isPathIsDir as jest.Mock).mockResolvedValue(true),
          syncQueries.getClient.mockResolvedValue(null)
        ),
        expected: { status: HttpStatus.NOT_FOUND, message: 'Client not found' }
      }
    ])('should throw $title', async ({ setup, expected }) => {
      const req = baseReq()
      setup()
      await expect(service.createPath(req, { remotePath: 'client/remote' } as any)).rejects.toMatchObject(expected)
    })

    it('should create path and return id and permissions, overriding remotePath and permissions', async () => {
      const req = baseReq()
      ;(isPathExists as jest.Mock).mockResolvedValue(true)
      ;(isPathIsDir as jest.Mock).mockResolvedValue(true)
      ;(getEnvPermissions as jest.Mock).mockReturnValue('env-perms')
      syncQueries.getClient.mockResolvedValue({ id: 'client-1' })
      // Spy on private getDBProps to simplify
      const getDBPropsSpy = jest.spyOn<any, any>(service as any, 'getDBProps').mockResolvedValue({ ownerId: 1 })
      syncQueries.createPath.mockResolvedValue(123)

      const res = await service.createPath(req, { remotePath: 'client/remote', permissions: 'client-perms' } as any)
      expect(res).toEqual({ id: 123, permissions: 'env-perms' })
      expect(syncQueries.createPath).toHaveBeenCalledWith(
        'client-1',
        { ownerId: 1 },
        expect.objectContaining({ remotePath: 'SPACES/alias/sub', permissions: 'env-perms' })
      )

      getDBPropsSpy.mockRestore()
    })
  })

  describe('deletePath', () => {
    it.each([
      { user: { id: 1, clientId: undefined } as any, id: 10, status: HttpStatus.BAD_REQUEST, msg: 'Client id is missing' },
      { user: { id: 1, clientId: 'c1' } as any, id: 10, status: HttpStatus.FORBIDDEN }
    ])('should handle errors (status=$status)', async ({ user, id, status, msg }) => {
      if (status === HttpStatus.FORBIDDEN) syncQueries.clientExistsForOwner.mockResolvedValue(false)
      await expect(service.deletePath(user, id)).rejects.toMatchObject(msg ? { status, message: msg } : { status })
    })

    it('should catch errors from deletePath and throw BAD_REQUEST', async () => {
      const user: any = { id: 1, clientId: 'c1' }
      syncQueries.clientExistsForOwner.mockResolvedValue(true)
      syncQueries.deletePath.mockRejectedValue(new Error('db'))
      await expect(service.deletePath(user, 10)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Unable to remove path'
      })
      expect(syncQueries.deletePath).toHaveBeenCalledWith('c1', 10)
    })

    it('should delete path successfully when allowed', async () => {
      const user: any = { id: 1, clientId: undefined }
      syncQueries.clientExistsForOwner.mockResolvedValue(true)
      syncQueries.deletePath.mockResolvedValue(undefined)
      await expect(service.deletePath(user, 10, 'cX')).resolves.toBeUndefined()
      expect(syncQueries.deletePath).toHaveBeenCalledWith('cX', 10)
    })
  })

  describe('updatePath', () => {
    it('should throw FORBIDDEN when client does not belong to owner', async () => {
      syncQueries.clientExistsForOwner.mockResolvedValue(false)
      await expect(service.updatePath({ id: 1 } as any, 'c1', 5, {} as any)).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN
      })
    })

    it('should throw NOT_FOUND when path settings do not exist', async () => {
      syncQueries.clientExistsForOwner.mockResolvedValue(true)
      syncQueries.getPathSettings.mockResolvedValue(null)
      await expect(service.updatePath({ id: 1 } as any, 'c1', 5, {} as any)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Sync path not found'
      })
    })

    it('should update path settings, set new timestamp, clear cache and return updated settings', async () => {
      syncQueries.clientExistsForOwner.mockResolvedValue(true)
      syncQueries.getPathSettings.mockResolvedValue({ id: 5, timestamp: 500, lastSync: 1, remotePath: '/a', permissions: 'p' })
      syncQueries.updatePathSettings.mockResolvedValue(undefined)
      ;(currentTimeStamp as jest.Mock).mockReturnValue(4242)

      const out = await service.updatePath({ id: 1 } as any, 'c1', 5, { id: 666, lastSync: 3, permissions: 'new' } as any)
      expect(syncQueries.updatePathSettings).toHaveBeenCalledWith(
        'c1',
        5,
        expect.objectContaining({ id: 5, lastSync: 3, timestamp: 4242, permissions: 'new' })
      )
      expect(syncQueries.clearCachePathSettings).toHaveBeenCalledWith('c1', 5)
      expect(out).toEqual(expect.objectContaining({ id: 5, lastSync: 3, timestamp: 4242, permissions: 'new' }))
    })

    it('should clear cache and throw INTERNAL_SERVER_ERROR when update fails', async () => {
      syncQueries.clientExistsForOwner.mockResolvedValue(true)
      syncQueries.getPathSettings.mockResolvedValue({ id: 5, timestamp: 500, lastSync: 1 })
      syncQueries.updatePathSettings.mockRejectedValue(new Error('db'))
      await expect(service.updatePath({ id: 1 } as any, 'c1', 5, {} as any)).rejects.toMatchObject({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Unable to update path'
      })
      expect(syncQueries.clearCachePathSettings).toHaveBeenCalledWith('c1', 5)
    })
  })

  describe('updatePaths', () => {
    beforeEach(() => {
      syncQueries.clientExistsForOwner.mockResolvedValue(true)
      spacesManager.spaceEnv.mockResolvedValue({ envPermissions: 'p' })
    })

    it('should throw when client id is missing', async () => {
      await expect(service.updatePaths(userWith(undefined) as any, [])).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Client id is missing'
      })
    })

    it('should throw FORBIDDEN when client does not belong to owner', async () => {
      syncQueries.clientExistsForOwner.mockResolvedValue(false)
      await expect(service.updatePaths(userWith('c1') as any, [])).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN
      })
    })

    it('should mark client paths as deleted and notify when no corresponding server paths (server remotePath undefined)', async () => {
      syncQueries.clientExistsForOwner.mockResolvedValue(true)
      syncQueries.getPaths.mockResolvedValue([{ id: 2, settings: { timestamp: 1, lastSync: 1 }, remotePath: undefined }])
      const clientPaths = [{ id: 1, remotePath: 'SPACES/a', timestamp: 1, lastSync: 1, permissions: 'p' } as any]

      const res = await service.updatePaths(userWith('c1') as any, clientPaths)
      expect(res.delete).toEqual([1])
      expect(notificationsManager.create).toHaveBeenCalledTimes(1)
    })

    it('should propagate spaceEnv errors as BAD_REQUEST', async () => {
      syncQueries.clientExistsForOwner.mockResolvedValue(true)
      syncQueries.getPaths.mockResolvedValue([{ id: 1, settings: { timestamp: 1, lastSync: 1 }, remotePath: 'SPACES/x' }])
      spacesManager.spaceEnv.mockRejectedValue(new Error('boom'))
      await expect(
        service.updatePaths(userWith('c1') as any, [{ id: 1, remotePath: 'SPACES/x', timestamp: 1, lastSync: 1, permissions: 'p' } as any])
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'boom'
      })
    })

    it('should skip server path when space is null and mark client item as deleted', async () => {
      syncQueries.clientExistsForOwner.mockResolvedValue(true)
      syncQueries.getPaths.mockResolvedValue([{ id: 2, settings: { timestamp: 1, lastSync: 1 }, remotePath: 'SPACES/x' }])
      spacesManager.spaceEnv.mockResolvedValue(null)
      const res = await service.updatePaths(userWith('c1') as any, [
        { id: 2, remotePath: 'SPACES/x', timestamp: 1, lastSync: 1, permissions: 'p' } as any
      ])
      expect(res.delete).toEqual([2])
      expect(notificationsManager.create).toHaveBeenCalledTimes(1)
    })

    it('should add server-only path to client with server permissions', async () => {
      syncQueries.clientExistsForOwner.mockResolvedValue(true)
      syncQueries.getPaths.mockResolvedValue([{ id: 3, settings: { timestamp: 1, lastSync: 1 }, remotePath: 'SPACES/x' }])
      spacesManager.spaceEnv.mockResolvedValue({ envPermissions: 'perm-xyz' })
      const res = await service.updatePaths(userWith('c1') as any, [])
      expect(res.add).toHaveLength(1)
      expect(res.add[0]).toEqual(expect.objectContaining({ id: 3, remotePath: 'SPACES/x', permissions: 'perm-xyz' }))
    })

    it('should update server settings from client when client is newer (no hasUpdates)', async () => {
      syncQueries.clientExistsForOwner.mockResolvedValue(true)
      syncQueries.getPaths.mockResolvedValue([{ id: 5, settings: { timestamp: 1, lastSync: 1, foo: 'server' }, remotePath: 'SPACES/x' }])
      spacesManager.spaceEnv.mockResolvedValue({ envPermissions: 'p' })

      const client = [{ id: 5, timestamp: 10, lastSync: 2, remotePath: 'SPACES/x', permissions: 'p', foo: 'client' } as any]
      await service.updatePaths(userWith('c1') as any, client)

      expect(syncQueries.updatePathSettings).toHaveBeenCalledWith('c1', 5, expect.objectContaining({ foo: 'client', lastSync: 2 }))
      // No client update instructions because hasUpdates=false and serverNewer=false
    })

    it('should push server-newer updates to client and also remotePath/permissions corrections', async () => {
      syncQueries.clientExistsForOwner.mockResolvedValue(true)
      syncQueries.getPaths.mockResolvedValue([{ id: 7, settings: { timestamp: 20, lastSync: 5, srv: true }, remotePath: 'SPACES/correct' }])
      spacesManager.spaceEnv.mockResolvedValue({ envPermissions: 'permX' })

      const client = [{ id: 7, timestamp: 10, lastSync: 5, remotePath: 'SPACES/wrong', permissions: 'old' } as any]
      const res = await service.updatePaths(userWith('c1') as any, client)

      // Should have two client updates: one full server settings + corrections, and one corrections-only
      expect(res.update).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 7, srv: true, remotePath: 'SPACES/correct', permissions: 'permX' }),
          expect.objectContaining({ id: 7, remotePath: 'SPACES/correct', permissions: 'permX' })
        ])
      )
      expect(syncQueries.updatePathSettings).toHaveBeenCalledWith('c1', 7, expect.objectContaining({ lastSync: 5 }))
      // clear cache called for each update instruction
      expect(syncQueries.clearCachePathSettings).toHaveBeenCalledTimes(res.update.length)
      for (const u of res.update) {
        expect(syncQueries.clearCachePathSettings).toHaveBeenCalledWith('c1', u.id)
      }
    })

    it('should trigger update when lastSync differs even if timestamps and settings match', async () => {
      syncQueries.clientExistsForOwner.mockResolvedValue(true)
      syncQueries.getPaths.mockResolvedValue([{ id: 9, settings: { timestamp: 10, lastSync: 1, flag: 'S' }, remotePath: 'SPACES/x' }])
      spacesManager.spaceEnv.mockResolvedValue({ envPermissions: 'p' })

      const client = [{ id: 9, timestamp: 10, lastSync: 2, remotePath: 'SPACES/x', permissions: 'p', flag: 'S' } as any]
      await service.updatePaths(userWith('c1') as any, client)
      expect(syncQueries.updatePathSettings).toHaveBeenCalledWith('c1', 9, expect.objectContaining({ lastSync: 2 }))
    })

    it('should perform no changes when client and server are identical (no-op branch)', async () => {
      syncQueries.clientExistsForOwner.mockResolvedValue(true)
      syncQueries.getPaths.mockResolvedValue([{ id: 12, settings: { timestamp: 5, lastSync: 7, flag: 'A' }, remotePath: 'SPACES/x' }])
      spacesManager.spaceEnv.mockResolvedValue({ envPermissions: 'p' })

      const client = [{ id: 12, timestamp: 5, lastSync: 7, remotePath: 'SPACES/x', permissions: 'p', flag: 'A' } as any]
      const res = await service.updatePaths(userWith('c1') as any, client)

      expect(res).toEqual({ add: [], update: [], delete: [] })
      expect(syncQueries.updatePathSettings).not.toHaveBeenCalled()
    })

    it('should correct client info while keeping server settings when timestamps are equal (hasUpdates=true)', async () => {
      syncQueries.clientExistsForOwner.mockResolvedValue(true)
      // Server has srv='S', client has wrong remotePath/permissions and extra clientOnly flag
      syncQueries.getPaths.mockResolvedValue([{ id: 13, settings: { timestamp: 5, lastSync: 1, srv: 'S' }, remotePath: 'SPACES/correct' }])
      spacesManager.spaceEnv.mockResolvedValue({ envPermissions: 'permX' })

      const client = [{ id: 13, timestamp: 5, lastSync: 1, remotePath: 'SPACES/wrong', permissions: 'old', clientOnly: 'C' } as any]
      const res = await service.updatePaths(userWith('c1') as any, client)

      // Server uses its own settings base (srv: 'S') with corrections applied
      expect(syncQueries.updatePathSettings).toHaveBeenCalledWith(
        'c1',
        13,
        expect.objectContaining({ srv: 'S', lastSync: 1, remotePath: 'SPACES/correct', permissions: 'permX' })
      )
      // Client should receive corrections for remotePath and permissions
      expect(res.update).toEqual(expect.arrayContaining([expect.objectContaining({ id: 13, remotePath: 'SPACES/correct', permissions: 'permX' })]))
    })

    it('should log error when updatePathSettings rejects inside updatePaths', async () => {
      syncQueries.clientExistsForOwner.mockResolvedValue(true)
      syncQueries.getPaths.mockResolvedValue([{ id: 11, settings: { timestamp: 1, lastSync: 1 }, remotePath: 'SPACES/x' }])
      spacesManager.spaceEnv.mockResolvedValue({ envPermissions: 'p' })
      // Force client newer to trigger updatePathSettings
      const client = [{ id: 11, timestamp: 10, lastSync: 2, remotePath: 'SPACES/x', permissions: 'p' } as any]
      syncQueries.updatePathSettings.mockRejectedValueOnce(new Error('db-fail'))
      const loggerSpy = jest.spyOn((service as any).logger, 'error').mockImplementation(() => undefined)

      await service.updatePaths(userWith('c1') as any, client)
      // wait for microtasks to ensure .catch executed
      await flush()

      expect(loggerSpy).toHaveBeenCalled()
      expect(loggerSpy.mock.calls.some(([msg]) => String(msg).includes('updatePaths'))).toBe(true)
    })

    it('should catch notify failure at updatePaths level when building notification fails', async () => {
      syncQueries.clientExistsForOwner.mockResolvedValue(true)
      // No server paths: will mark client path as deleted and call notify
      syncQueries.getPaths.mockResolvedValue([])
      const loggerSpy = jest.spyOn((service as any).logger, 'error').mockImplementation(() => undefined)
      // BAD first segment to make notify fail while building URL (before notificationsManager.create)
      const client = [{ id: 1, remotePath: 'BAD/a/b', timestamp: 1, lastSync: 1, permissions: 'p' } as any]

      const res = await service.updatePaths(userWith('c1') as any, client)
      await flush()

      expect(res.delete).toEqual([1])
      expect(loggerSpy).toHaveBeenCalled()
      expect(loggerSpy.mock.calls.some(([msg]) => String(msg).includes('updatePaths'))).toBe(true)
      // create not called because we failed before reaching it
      expect(notificationsManager.create).not.toHaveBeenCalled()
    })

    it('should catch error inside notify when notifications creation fails', async () => {
      syncQueries.clientExistsForOwner.mockResolvedValue(true)
      syncQueries.getPaths.mockResolvedValue([])
      // Valid remotePath to build URL correctly
      const client = [{ id: 2, remotePath: 'SPACES/a', timestamp: 1, lastSync: 1, permissions: 'p' } as any]
      const loggerSpy = jest.spyOn((service as any).logger, 'error').mockImplementation(() => undefined)
      notificationsManager.create.mockRejectedValueOnce(new Error('notify-fail'))

      const res = await service.updatePaths(userWith('c1') as any, client)
      await flush()

      expect(res.delete).toEqual([2])
      expect(loggerSpy).toHaveBeenCalled()
      // error comes from notify() catch
      expect(loggerSpy.mock.calls.some(([msg]) => String(msg).includes('notify'))).toBe(true)
    })
  })

  describe('getDBProps (private) branches', () => {
    it('should throw BAD_REQUEST for shares list selection', async () => {
      await expect((service as any).getDBProps({ inSharesList: true } as any)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Sync all shares is not supported, you must select a sub-directory'
      })
    })

    it('should return ownerId only for personal space at root', async () => {
      const res = await (service as any).getDBProps({
        inSharesList: false,
        inPersonalSpace: true,
        paths: [],
        dbFile: { ownerId: 42 }
      } as any)
      expect(res).toEqual({ ownerId: 42 })
    })

    it('should return ownerId and fileId for personal space subdir', async () => {
      const getOrCreateFileIdSpy = jest.spyOn<any, any>(service as any, 'getOrCreateFileId').mockResolvedValue(77)
      const res = await (service as any).getDBProps({
        inPersonalSpace: true,
        paths: ['sub'],
        dbFile: { ownerId: 42 }
      } as any)
      expect(res).toEqual({ ownerId: 42, fileId: 77 })
      getOrCreateFileIdSpy.mockRestore()
    })

    it('should throw BAD_REQUEST for whole files repository without alias', async () => {
      await expect((service as any).getDBProps({ inFilesRepository: true, root: { alias: null }, paths: [] } as any)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Sync all space is not yet supported, you must select a sub-directory'
      })
    })

    it('should return spaceId and rootId for files repository root selection', async () => {
      const res = await (service as any).getDBProps({
        inFilesRepository: true,
        id: 5,
        root: { id: 3, alias: 'x' },
        paths: []
      } as any)
      expect(res).toEqual({ spaceId: 5, spaceRootId: 3 })
    })

    it('should return spaceId, rootId and fileId for files repository subdir or null root', async () => {
      const getOrCreateFileIdSpy = jest.spyOn<any, any>(service as any, 'getOrCreateFileId').mockResolvedValue(88)
      const res = await (service as any).getDBProps({
        inFilesRepository: true,
        id: 5,
        root: { id: 3, alias: 'x' },
        paths: ['sub']
      } as any)
      expect(res).toEqual({ spaceId: 5, spaceRootId: 3, fileId: 88 })
      getOrCreateFileIdSpy.mockRestore()
    })

    it('should return spaceId and null spaceRootId plus fileId when files repository root has no id', async () => {
      const getOrCreateFileIdSpy = jest.spyOn<any, any>(service as any, 'getOrCreateFileId').mockResolvedValue(90)
      const res = await (service as any).getDBProps({
        inFilesRepository: true,
        id: 6,
        root: { id: undefined, alias: 'x' },
        paths: []
      } as any)
      expect(res).toEqual({ spaceId: 6, spaceRootId: null, fileId: 90 })
      getOrCreateFileIdSpy.mockRestore()
    })

    it('should return shareId only for shares repository root', async () => {
      const res = await (service as any).getDBProps({
        inSharesList: false,
        inPersonalSpace: false,
        inFilesRepository: false,
        inSharesRepository: true,
        id: 9,
        paths: []
      } as any)
      expect(res).toEqual({ shareId: 9 })
    })

    it('should return shareId and fileId for shares repository subdir', async () => {
      const getOrCreateFileIdSpy = jest.spyOn<any, any>(service as any, 'getOrCreateFileId').mockResolvedValue(55)
      const res = await (service as any).getDBProps({
        inSharesList: false,
        inPersonalSpace: false,
        inFilesRepository: false,
        inSharesRepository: true,
        id: 9,
        paths: ['sub']
      } as any)
      expect(res).toEqual({ shareId: 9, fileId: 55 })
      getOrCreateFileIdSpy.mockRestore()
    })

    it('should return undefined when no space flags match (no branch taken)', async () => {
      const res = await (service as any).getDBProps({
        inSharesList: false,
        inPersonalSpace: false,
        inFilesRepository: false,
        inSharesRepository: false,
        paths: []
      } as any)
      expect(res).toBeUndefined()
    })
  })

  describe('getOrCreateFileId (private) branches', () => {
    it('should return existing file id without creation', async () => {
      ;(getProps as jest.Mock).mockResolvedValue({ name: 'file' })
      filesQueries.getSpaceFileId.mockResolvedValue(101)
      const id = await (service as any).getOrCreateFileId({
        realPath: '/rp',
        dbFile: { path: '.' }
      })
      expect(id).toBe(101)
      expect(filesQueries.getOrCreateSpaceFile).not.toHaveBeenCalled()
    })

    it('should create file when not exists and return its id', async () => {
      ;(getProps as jest.Mock).mockResolvedValue({ id: 999, name: 'file' })
      filesQueries.getSpaceFileId.mockResolvedValue(0)
      filesQueries.getOrCreateSpaceFile.mockResolvedValue(202)
      const id = await (service as any).getOrCreateFileId({
        realPath: '/rp',
        dbFile: { path: '.' }
      })
      expect(id).toBe(202)
      expect(filesQueries.getOrCreateSpaceFile).toHaveBeenCalledWith(0, expect.objectContaining({ id: undefined }), { path: '.' })
    })
  })
})
