import { HttpService } from '@nestjs/axios'
import { HttpStatus } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import archiver from 'archiver'
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import * as tar from 'tar'
import * as imageUtils from '../../../common/image'
import { ContextManager } from '../../../infrastructure/context/services/context-manager.service'
import { NotificationsManager } from '../../notifications/services/notifications-manager.service'
import { SpacesManager } from '../../spaces/services/spaces-manager.service'
import * as spacesPathUtils from '../../spaces/utils/paths'
import * as spacesPermsUtils from '../../spaces/utils/permissions'
import { DEPTH } from '../../webdav/constants/webdav'
import { ACTION } from '../../../common/constants'
import { FILE_OPERATION } from '../constants/operations'
import { FileEvent, FileTaskEvent } from '../events/file-events'
import { FileError } from '../models/file-error'
import { LockConflict } from '../models/file-lock-error'
import { SendFile } from '../utils/send-file'
import * as unzipUtils from '../utils/unzip-file'
import * as filesUtils from '../utils/files'
import { FilesLockManager } from './files-lock-manager.service'
import { FilesManager } from './files-manager.service'
import { FilesQueries } from './files-queries.service'

jest.mock('archiver', () => ({
  __esModule: true,
  default: jest.fn()
}))

jest.mock('tar', () => ({
  __esModule: true,
  extract: jest.fn()
}))

describe(FilesManager.name, () => {
  let service: FilesManager
  let http: { axiosRef: jest.Mock }
  let filesQueries: { moveFiles: jest.Mock; deleteFiles: jest.Mock }
  let spacesManager: { spaceEnv: jest.Mock }
  let contextManager: { headerOriginUrl: jest.Mock }
  let notificationsManager: { create: jest.Mock }
  let filesLockManager: {
    create: jest.Mock
    checkConflicts: jest.Mock
    removeLock: jest.Mock
    createOrRefresh: jest.Mock
    getLocksByPath: jest.Mock
    convertLockToFileLockProps: jest.Mock
    removeChildLocks: jest.Mock
  }

  const user = { id: 7, login: 'john', tasksPath: '/data/users/john/tmp/tasks' } as any

  const makeSpace = (overrides: Record<string, any> = {}) =>
    ({
      id: 1,
      alias: 'personal',
      repository: 'files',
      url: 'files/personal/file.txt',
      realPath: '/data/users/john/files/file.txt',
      realBasePath: '/data/users/john/files',
      dbFile: { ownerId: 7, path: 'file.txt', inTrash: false },
      inTrashRepository: false,
      quotaIsExceeded: false,
      storageQuota: null,
      willExceedQuota: jest.fn().mockReturnValue(false),
      task: { cacheKey: '', props: {} },
      ...overrides
    }) as any

  const setPathExists = (values: Record<string, boolean>, fallback = false) => {
    ;(filesUtils.isPathExists as jest.Mock).mockImplementation(async (p: string) => (p in values ? values[p] : fallback))
  }

  beforeEach(async () => {
    http = { axiosRef: jest.fn() }
    filesQueries = {
      moveFiles: jest.fn().mockResolvedValue(undefined),
      deleteFiles: jest.fn().mockResolvedValue(undefined)
    }
    spacesManager = {
      spaceEnv: jest.fn().mockResolvedValue(makeSpace())
    }
    contextManager = {
      headerOriginUrl: jest.fn().mockReturnValue('https://sync-in.example')
    }
    notificationsManager = {
      create: jest.fn().mockResolvedValue(undefined)
    }
    filesLockManager = {
      create: jest.fn().mockResolvedValue([true, { key: 'lock-1' }]),
      checkConflicts: jest.fn().mockResolvedValue(undefined),
      removeLock: jest.fn().mockResolvedValue(true),
      createOrRefresh: jest.fn().mockResolvedValue([false, { key: 'lock-2' }]),
      getLocksByPath: jest.fn().mockResolvedValue([]),
      convertLockToFileLockProps: jest.fn().mockReturnValue({ owner: { id: 7, login: 'john' }, app: 'Sync-in', isExclusive: true }),
      removeChildLocks: jest.fn().mockResolvedValue(undefined)
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: FilesQueries, useValue: filesQueries },
        { provide: SpacesManager, useValue: spacesManager },
        { provide: ContextManager, useValue: contextManager },
        { provide: NotificationsManager, useValue: notificationsManager },
        { provide: HttpService, useValue: http },
        { provide: FilesLockManager, useValue: filesLockManager },
        FilesManager
      ]
    }).compile()

    module.useLogger(['fatal'])
    service = module.get<FilesManager>(FilesManager)

    jest.spyOn(filesUtils, 'isPathExists').mockResolvedValue(true)
    jest.spyOn(filesUtils, 'isPathIsDir').mockResolvedValue(false)
    jest.spyOn(filesUtils, 'makeDir').mockResolvedValue('/tmp' as any)
    jest.spyOn(filesUtils, 'writeFromStream').mockResolvedValue(undefined)
    jest.spyOn(filesUtils, 'writeFromStreamAndChecksum').mockResolvedValue('sha256-abc')
    jest.spyOn(filesUtils, 'moveFiles').mockResolvedValue(undefined)
    jest.spyOn(filesUtils, 'copyFiles').mockResolvedValue(undefined)
    jest.spyOn(filesUtils, 'removeFiles').mockResolvedValue(undefined)
    jest.spyOn(filesUtils, 'touchFile').mockResolvedValue(undefined)
    jest.spyOn(filesUtils, 'createEmptyFile').mockResolvedValue(undefined)
    jest.spyOn(filesUtils, 'copyFileContent').mockResolvedValue(undefined)
    jest.spyOn(filesUtils, 'fileSize').mockResolvedValue(100)
    jest.spyOn(filesUtils, 'dirSize').mockResolvedValue([123, {}] as any)
    jest.spyOn(filesUtils, 'uniqueFilePathFromDir').mockResolvedValue('/tmp/unique-path.txt')
    jest.spyOn(filesUtils, 'uniqueDatedFilePath').mockResolvedValue({ isDir: false, path: '/trash/file-2026.txt' })
    jest.spyOn(filesUtils, 'getMimeType').mockReturnValue('image-png')
    jest.spyOn(spacesPermsUtils, 'canAccessToSpace').mockReturnValue(true)
    jest.spyOn(spacesPermsUtils, 'haveSpaceEnvPermissions').mockReturnValue(true)
    jest.spyOn(spacesPathUtils, 'realTrashPathFromSpace').mockReturnValue('/data/users/john/trash')
  })

  afterEach(() => {
    jest.restoreAllMocks()
    jest.clearAllMocks()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  it('sendFileFromSpace should return a SendFile instance', () => {
    const space = makeSpace()
    const sendFile = service.sendFileFromSpace(space, 'download.txt')
    expect(sendFile).toBeInstanceOf(SendFile)
  })

  it('saveStream should reject POST when resource already exists', async () => {
    const space = makeSpace()
    setPathExists({ [space.realPath]: true }, true)

    await expect(service.saveStream(user, space, { method: 'POST', headers: {}, raw: Readable.from(['x']) } as any)).rejects.toEqual(
      new FileError(HttpStatus.METHOD_NOT_ALLOWED, 'Resource already exists')
    )
  })

  it('saveStream should write stream, emit event and release lock', async () => {
    const space = makeSpace()
    setPathExists({ [space.realPath]: false, [path.dirname(space.realPath)]: true }, false)
    const emitSpy = jest.spyOn(FileEvent, 'emit')

    const result = await service.saveStream(user, space, { method: 'PUT', headers: {}, raw: Readable.from(['hello']) } as any)

    expect(result).toBe(false)
    expect(filesLockManager.create).toHaveBeenCalledWith(user, space.dbFile, 'Sync-in', DEPTH.RESOURCE)
    expect(filesUtils.writeFromStream).toHaveBeenCalledWith(space.realPath, expect.anything(), 0)
    expect(filesLockManager.removeLock).toHaveBeenCalledWith('lock-1')
    expect(emitSpy).toHaveBeenCalledWith('event', { user, space, action: ACTION.ADD, rPath: space.realPath })
  })

  it('saveStream should use DAV conflict checks and checksum mode when requested', async () => {
    const space = makeSpace()
    setPathExists({ [space.realPath]: true, [path.dirname(space.realPath)]: true }, true)

    const checksum = await service.saveStream(
      user,
      space,
      { method: 'PUT', headers: { 'content-range': 'bytes 100-199/200' }, raw: Readable.from(['chunk']) } as any,
      { dav: { depth: DEPTH.RESOURCE, lockTokens: ['token'] }, checksumAlg: 'sha256' }
    )

    expect(checksum).toBe('sha256-abc')
    expect(filesLockManager.checkConflicts).toHaveBeenCalledWith(space.dbFile, DEPTH.RESOURCE, { userId: 7, lockTokens: ['token'] })
    expect(filesLockManager.create).not.toHaveBeenCalled()
    expect(filesUtils.writeFromStreamAndChecksum).toHaveBeenCalled()
  })

  it('saveMultipart should write one PATCH part and emit update event', async () => {
    const space = makeSpace({
      url: 'files/personal/report.txt',
      realPath: '/data/users/john/files/report.txt',
      dbFile: { ownerId: 7, path: 'report.txt' }
    })
    setPathExists({ [path.dirname(space.realPath)]: true, [space.realPath]: true }, false)
    ;(filesUtils.isPathIsDir as jest.Mock).mockResolvedValue(true)
    const emitSpy = jest.spyOn(FileEvent, 'emit')

    const req = {
      method: 'PATCH',
      files: async function* () {
        yield { filename: 'ignored-on-patch.txt', file: Readable.from(['content']) }
      }
    }

    await service.saveMultipart(user, space, req as any)

    expect(filesLockManager.createOrRefresh).toHaveBeenCalled()
    expect(filesUtils.writeFromStream).toHaveBeenCalledWith('/data/users/john/files/report.txt', expect.anything())
    expect(emitSpy).toHaveBeenCalledWith('event', expect.objectContaining({ action: ACTION.UPDATE, rPath: '/data/users/john/files/report.txt' }))
  })

  it('touch should fail when location does not exist', async () => {
    const space = makeSpace()
    ;(filesUtils.isPathExists as jest.Mock).mockResolvedValueOnce(false)

    await expect(service.touch(user, space, 123456)).rejects.toEqual(new FileError(HttpStatus.NOT_FOUND, 'Location not found'))
  })

  it('touch should check locks and update mtime', async () => {
    const space = makeSpace()
    ;(filesUtils.isPathExists as jest.Mock).mockResolvedValueOnce(true)

    await service.touch(user, space, 111)

    expect(filesLockManager.checkConflicts).toHaveBeenCalledWith(space.dbFile, DEPTH.RESOURCE, { userId: 7 })
    expect(filesUtils.touchFile).toHaveBeenCalledWith(space.realPath, 111)
  })

  it('mkFile should use sample document when requested', async () => {
    const space = makeSpace({ realPath: '/data/users/john/files/doc.docx' })
    ;(filesUtils.isPathExists as jest.Mock).mockResolvedValueOnce(false)
    const emitSpy = jest.spyOn(FileEvent, 'emit')

    await service.mkFile(user, space, false, true, true)

    expect(filesUtils.copyFileContent).toHaveBeenCalledWith(expect.stringContaining('assets/samples/sample.docx'), '/data/users/john/files/doc.docx')
    expect(emitSpy).toHaveBeenCalledWith('event', { user, space, action: ACTION.ADD, rPath: space.realPath })
  })

  it('mkDir should check conflicts and create directory', async () => {
    const space = makeSpace({ realPath: '/data/users/john/files/folder' })
    ;(filesUtils.isPathExists as jest.Mock).mockResolvedValueOnce(false).mockResolvedValueOnce(true)

    await service.mkDir(user, space, false, { depth: DEPTH.INFINITY, lockTokens: ['lt1'] })

    expect(filesLockManager.checkConflicts).toHaveBeenCalledWith(space.dbFile, DEPTH.INFINITY, { userId: 7, lockTokens: ['lt1'] })
    expect(filesUtils.makeDir).toHaveBeenCalledWith('/data/users/john/files/folder', false)
  })

  it('copyMove should copy file and emit add event', async () => {
    const src = makeSpace({
      id: 10,
      url: 'files/personal/src.txt',
      realPath: '/data/users/john/files/src.txt',
      realBasePath: '/data/users/john/files',
      dbFile: { ownerId: 7, path: 'src.txt', inTrash: false }
    })
    const dst = makeSpace({
      id: 11,
      url: 'files/personal/dst.txt',
      realPath: '/data/users/john/files/dst.txt',
      realBasePath: '/data/users/john/files',
      dbFile: { ownerId: 7, path: 'dst.txt', inTrash: false },
      storageQuota: null
    })
    setPathExists(
      {
        [src.realPath]: true,
        [path.dirname(dst.realPath)]: true,
        [dst.realPath]: false
      },
      false
    )
    ;(filesUtils.isPathIsDir as jest.Mock).mockResolvedValueOnce(false)
    const emitSpy = jest.spyOn(FileEvent, 'emit')

    await service.copyMove(user, src, dst, false)

    expect(filesLockManager.checkConflicts).toHaveBeenCalledWith(dst.dbFile, DEPTH.RESOURCE, { userId: 7, lockTokens: undefined })
    expect(filesUtils.copyFiles).toHaveBeenCalledWith(src.realPath, dst.realPath, false, false)
    expect(emitSpy).toHaveBeenCalledWith('event', { user, space: dst, action: ACTION.ADD, rPath: dst.realPath })
  })

  it('copyMove should move across spaces and update db', async () => {
    const src = makeSpace({
      id: 21,
      url: 'files/personal/src.txt',
      realPath: '/src-base/src.txt',
      realBasePath: '/src-base',
      dbFile: { ownerId: 7, path: 'src.txt', inTrash: false }
    })
    const dst = makeSpace({
      id: 22,
      url: 'files/project/dst.txt',
      realPath: '/dst-base/dst.txt',
      realBasePath: '/dst-base',
      dbFile: { ownerId: null, spaceId: 22, path: 'dst.txt', inTrash: false },
      storageQuota: null
    })
    setPathExists(
      {
        [src.realPath]: true,
        [path.dirname(dst.realPath)]: true,
        [dst.realPath]: false
      },
      false
    )
    ;(filesUtils.isPathIsDir as jest.Mock).mockResolvedValueOnce(false)
    const emitSpy = jest.spyOn(FileEvent, 'emit')

    await service.copyMove(user, src, dst, true)

    expect(filesUtils.moveFiles).toHaveBeenCalledWith('/src-base/src.txt', '/dst-base/dst.txt', false)
    expect(filesQueries.moveFiles).toHaveBeenCalledWith(src.dbFile, dst.dbFile, false)
    expect(emitSpy).toHaveBeenCalledWith('event', { user, space: src, action: ACTION.DELETE_PERMANENTLY, rPath: '/src-base/src.txt' })
    expect(emitSpy).toHaveBeenCalledWith('event', { user, space: dst, action: ACTION.ADD, rPath: '/dst-base/dst.txt' })
  })

  it('delete should remove trash file, locks and db entries', async () => {
    const space = makeSpace({ inTrashRepository: true, realPath: '/data/users/john/trash/old.txt' })
    ;(filesUtils.isPathExists as jest.Mock).mockResolvedValueOnce(true)
    ;(filesUtils.isPathIsDir as jest.Mock).mockResolvedValueOnce(true)
    filesLockManager.getLocksByPath.mockResolvedValueOnce([{ key: 'lk-1' }])
    const emitSpy = jest.spyOn(FileEvent, 'emit')

    await service.delete(user, space)

    expect(filesUtils.removeFiles).toHaveBeenCalledWith('/data/users/john/trash/old.txt')
    expect(filesLockManager.removeChildLocks).toHaveBeenCalledWith(user, space.dbFile)
    expect(filesLockManager.removeLock).toHaveBeenCalledWith('lk-1')
    expect(filesQueries.deleteFiles).toHaveBeenCalledWith(space.dbFile, true, false)
    expect(emitSpy).toHaveBeenCalledWith('event', { user, space, action: ACTION.DELETE_PERMANENTLY, rPath: '/data/users/john/trash/old.txt' })
  })

  it('delete should force delete when trash path is not available', async () => {
    const space = makeSpace({ realPath: '/data/users/john/files/no-trash.txt', inTrashRepository: false })
    ;(filesUtils.isPathExists as jest.Mock).mockResolvedValueOnce(true)
    ;(filesUtils.isPathIsDir as jest.Mock).mockResolvedValueOnce(false)
    ;(spacesPathUtils.realTrashPathFromSpace as jest.Mock).mockReturnValueOnce(null)

    await service.delete(user, space)

    expect(filesUtils.removeFiles).toHaveBeenCalledWith('/data/users/john/files/no-trash.txt')
    expect(filesQueries.deleteFiles).toHaveBeenCalledWith(space.dbFile, false, true)
  })

  it('downloadFromUrl should throw conflict when lock cannot be created', async () => {
    const space = makeSpace()
    filesLockManager.create.mockResolvedValueOnce([false, { key: 'other', owner: { id: 99 } }])

    await expect(service.downloadFromUrl(user, space, 'https://example.org/file.txt')).rejects.toBeInstanceOf(LockConflict)
  })

  it('downloadFromUrl should handle HEAD+GET and emit task watch/event', async () => {
    const space = makeSpace({ task: { cacheKey: 'task-1', props: {} } })
    ;(filesUtils.uniqueFilePathFromDir as jest.Mock).mockResolvedValueOnce('/tmp/download.txt')
    http.axiosRef
      .mockResolvedValueOnce({
        headers: { 'content-length': '55' },
        request: { socket: { remoteAddress: '8.8.8.8' } }
      })
      .mockResolvedValueOnce({
        data: Readable.from(['abc']),
        request: { socket: { remoteAddress: '8.8.8.8' } }
      })
    const taskEmitSpy = jest.spyOn(FileTaskEvent, 'emit')
    const fileEmitSpy = jest.spyOn(FileEvent, 'emit')

    await service.downloadFromUrl(user, space, 'https://example.org/file.txt')

    expect(space.task.props.totalSize).toBe(55)
    expect(taskEmitSpy).toHaveBeenCalledWith('startWatch', space, FILE_OPERATION.DOWNLOAD, '/tmp/download.txt')
    expect(filesUtils.writeFromStream).toHaveBeenCalledWith('/tmp/download.txt', expect.anything())
    expect(filesLockManager.removeLock).toHaveBeenCalledWith('lock-1')
    expect(fileEmitSpy).toHaveBeenCalledWith('event', { user, space, action: ACTION.ADD, rPath: '/tmp/download.txt' })
  })

  it('compress should archive files and emit events', async () => {
    const archive = {
      on: jest.fn().mockReturnThis(),
      pipe: jest.fn().mockReturnThis(),
      directory: jest.fn().mockReturnThis(),
      file: jest.fn().mockReturnThis(),
      finalize: jest.fn().mockResolvedValue(undefined)
    }
    ;(archiver as unknown as jest.Mock).mockReturnValueOnce(archive)
    jest.spyOn(fs, 'createWriteStream').mockReturnValue({} as any)
    ;(filesUtils.uniqueFilePathFromDir as jest.Mock).mockResolvedValueOnce('/tmp/archive.tar.gz')
    ;(filesUtils.isPathIsDir as jest.Mock).mockImplementation(async (p: string) => p.endsWith('/dir'))
    const space = makeSpace({ realPath: '/data/users/john/files/source.txt', task: { cacheKey: 'task-c', props: {} } })
    const dto = {
      name: 'archive',
      extension: 'tar.gz',
      compressInDirectory: false,
      files: [
        { path: '/data/users/john/files/dir', name: 'dir', rootAlias: null },
        { path: '/data/users/john/files/file.txt', name: 'file.txt', rootAlias: null }
      ]
    } as any
    const taskEmitSpy = jest.spyOn(FileTaskEvent, 'emit')

    await service.compress(user, space, dto)

    expect(archiver as unknown as jest.Mock).toHaveBeenCalled()
    expect(archive.directory).toHaveBeenCalled()
    expect(archive.file).toHaveBeenCalled()
    expect(archive.finalize).toHaveBeenCalled()
    expect(taskEmitSpy).toHaveBeenCalledWith('startWatch', space, FILE_OPERATION.COMPRESS, '/tmp/archive.tar.gz')
  })

  it('decompress should extract zip and release lock', async () => {
    const space = makeSpace({ realPath: '/data/users/john/files/archive.zip', task: { cacheKey: 'task-d', props: {} } })
    ;(filesUtils.isPathExists as jest.Mock).mockResolvedValueOnce(true)
    ;(filesUtils.uniqueFilePathFromDir as jest.Mock).mockResolvedValueOnce('/data/users/john/files/archive')
    const unzipSpy = jest.spyOn(unzipUtils, 'extractZip').mockResolvedValueOnce(undefined)
    const taskEmitSpy = jest.spyOn(FileTaskEvent, 'emit')

    await service.decompress(user, space)

    expect(filesUtils.makeDir).toHaveBeenCalledWith('/data/users/john/files/archive')
    expect(unzipSpy).toHaveBeenCalledWith('/data/users/john/files/archive.zip', '/data/users/john/files/archive')
    expect(taskEmitSpy).toHaveBeenCalledWith('startWatch', space, FILE_OPERATION.DECOMPRESS, '/data/users/john/files/archive')
    expect(filesLockManager.removeLock).toHaveBeenCalledWith('lock-1')
  })

  it('decompress should extract tar formats via tar.extract', async () => {
    const space = makeSpace({ realPath: '/data/users/john/files/archive.tar.gz' })
    ;(filesUtils.isPathExists as jest.Mock).mockResolvedValueOnce(true)
    ;(filesUtils.uniqueFilePathFromDir as jest.Mock).mockResolvedValueOnce('/data/users/john/files/archive')
    ;(tar.extract as unknown as jest.Mock).mockResolvedValueOnce(undefined)

    await service.decompress(user, space)

    expect(tar.extract).toHaveBeenCalledWith(
      expect.objectContaining({
        file: '/data/users/john/files/archive.tar.gz',
        cwd: '/data/users/john/files/archive',
        gzip: true
      })
    )
  })

  it('generateThumbnail should validate image and return generated stream', async () => {
    const space = makeSpace({ realPath: '/data/users/john/files/image.png' })
    ;(filesUtils.isPathExists as jest.Mock).mockResolvedValueOnce(true)
    ;(filesUtils.getMimeType as jest.Mock).mockReturnValueOnce('image-png')
    const stream = Readable.from(['img'])
    jest.spyOn(imageUtils, 'generateThumbnail').mockReturnValueOnce(stream as any)

    const result = await service.generateThumbnail(space, 256)

    expect(result).toBe(stream)
  })

  it('lock should fail if resource does not exist', async () => {
    const space = makeSpace()
    ;(filesUtils.isPathExists as jest.Mock).mockResolvedValueOnce(false)

    await expect(service.lock(user, space)).rejects.toEqual(new FileError(HttpStatus.BAD_REQUEST, 'Lock refresh must specify an existing resource'))
  })

  it('unlock should remove owned lock and reject foreign lock', async () => {
    const space = makeSpace()
    ;(filesUtils.isPathExists as jest.Mock).mockResolvedValue(true)
    filesLockManager.getLocksByPath.mockResolvedValueOnce([{ key: 'l1', owner: { id: 7 } }])

    await service.unlock(user, space)
    expect(filesLockManager.removeLock).toHaveBeenCalledWith('l1')

    filesLockManager.getLocksByPath.mockResolvedValueOnce([{ key: 'l2', owner: { id: 99, login: 'alice' } }])
    await expect(service.unlock(user, space)).rejects.toEqual(
      new LockConflict({ key: 'l2', owner: { id: 99, login: 'alice' } } as any, 'Conflicting lock')
    )
  })

  it('unlockRequest should throw when lock list is empty and notify foreign owner otherwise', async () => {
    const space = makeSpace()
    filesLockManager.getLocksByPath.mockResolvedValueOnce([])
    await expect(service.unlockRequest(user, space)).rejects.toEqual(new FileError(HttpStatus.NOT_FOUND, 'Lock not found'))

    filesLockManager.getLocksByPath.mockResolvedValueOnce([{ key: 'l3', owner: { id: 42 } }])
    await service.unlockRequest(user, space)
    expect(notificationsManager.create).toHaveBeenCalledWith(
      [42],
      expect.objectContaining({ element: 'file.txt', url: 'files/personal' }),
      expect.objectContaining({ author: user, currentUrl: 'https://sync-in.example' })
    )
  })

  it('getSize should return directory size or file size depending on target type', async () => {
    const space = makeSpace()
    ;(filesUtils.isPathExists as jest.Mock).mockResolvedValue(true)
    ;(filesUtils.isPathIsDir as jest.Mock).mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    ;(filesUtils.dirSize as jest.Mock).mockResolvedValueOnce([500, {}])
    ;(filesUtils.fileSize as jest.Mock).mockResolvedValueOnce(20)

    await expect(service.getSize(space)).resolves.toBe(500)
    await expect(service.getSize(space)).resolves.toBe(20)
  })
})
