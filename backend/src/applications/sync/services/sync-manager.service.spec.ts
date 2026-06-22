import { HttpException, HttpStatus, StreamableFile } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
// Helpers to access mocked fs/promises
import fsPromisesModule from 'fs/promises'
import path from 'node:path'
import { FILE_OPERATION } from '../../files/constants/operations'
import { FileError } from '../../files/models/file-error'
import { LockConflict } from '../../files/models/file-lock-error'
import { FilesManager } from '../../files/services/files-manager.service'
import { checksumFile, isPathExists, isPathIsDir, removeFiles, touchFile } from '../../files/utils/files'
import { SpacesManager } from '../../spaces/services/spaces-manager.service'
import { F_SPECIAL_STAT, F_STAT, SYNC_CHECKSUM_ALG, SYNC_DIFF_DONE } from '../constants/sync'
import { SyncManager } from './sync-manager.service'
import { SyncQueries } from './sync-queries.service'
import { Mock } from 'vitest'

// Mock fs/promises used internally by the service
vi.mock('fs/promises', () => ({
  __esModule: true,
  default: {
    stat: vi.fn(),
    readdir: vi.fn()
  }
}))

// Mock helper functions used in service
vi.mock('../../files/utils/files', () => ({
  __esModule: true,
  checksumFile: vi.fn(),
  isPathExists: vi.fn(),
  isPathIsDir: vi.fn(),
  removeFiles: vi.fn(),
  touchFile: vi.fn(),
  sanitizePath: vi.fn((p: string) => p)
}))

// Mock regExpPathPattern to a simple, predictable behavior
vi.mock('../../../common/functions', () => ({
  __esModule: true,
  regExpPathPattern: (base: string) => new RegExp('^' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
}))

// Mock routes helper used by copyMove to bypass repo validation
vi.mock('../utils/routes', () => ({
  __esModule: true,
  SYNC_PATH_TO_SPACE_SEGMENTS: vi.fn((dst: string) => dst)
}))

// Mock heavy providers to avoid configuration side-effects on import
vi.mock('../../files/services/files-manager.service', () => ({
  __esModule: true,
  FilesManager: class FilesManager {}
}))
vi.mock('../../spaces/services/spaces-manager.service', () => ({
  __esModule: true,
  SpacesManager: class SpacesManager {}
}))
vi.mock('./sync-queries.service', () => ({
  __esModule: true,
  SyncQueries: class SyncQueries {}
}))

const fsPromises = fsPromisesModule as unknown as { stat: Mock; readdir: Mock }

// small helper to collect async generators
const collect = async <T>(iter: AsyncIterable<T>): Promise<T[]> => {
  const out: T[] = []
  for await (const i of iter) out.push(i)
  return out
}

describe(SyncManager.name, () => {
  let service: SyncManager
  let filesManager: {
    sendFileFromSpace: Mock
    saveStream: Mock
    delete: Mock
    touch: Mock
    mkDir: Mock
    mkFile: Mock
    copyMove: Mock
  }
  let spacesManager: { spaceEnv: Mock }
  let syncQueries: { getPathSettings: Mock }

  beforeAll(async () => {
    filesManager = {
      sendFileFromSpace: vi.fn(),
      saveStream: vi.fn(),
      delete: vi.fn(),
      touch: vi.fn(),
      mkDir: vi.fn(),
      mkFile: vi.fn(),
      copyMove: vi.fn()
    }
    spacesManager = { spaceEnv: vi.fn() }
    syncQueries = { getPathSettings: vi.fn() }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncManager,
        { provide: SpacesManager, useValue: spacesManager },
        { provide: FilesManager, useValue: filesManager },
        { provide: SyncQueries, useValue: syncQueries }
      ]
    }).compile()

    module.useLogger(['fatal'])
    service = module.get<SyncManager>(SyncManager)
  })

  beforeEach(() => vi.clearAllMocks())

  const makeReq = (over?: Partial<any>) => ({
    method: 'PUT',
    user: { id: 1, clientId: 42 },
    space: { realPath: '/base/file.txt', url: '/space/file.txt' },
    ...over
  })

  const makeReply = () => {
    const raw = { writeHead: vi.fn(), write: vi.fn(), end: vi.fn() }
    return { raw, status: vi.fn().mockReturnThis() }
  }

  describe('download', () => {
    it('should stream file successfully', async () => {
      const req = makeReq()
      const res = makeReply()
      const checks = vi.fn().mockResolvedValue(undefined)
      const stream = vi.fn().mockResolvedValue(new StreamableFile(Buffer.from('abc')))
      filesManager.sendFileFromSpace.mockReturnValue({ checks, stream })

      const result = await service.download(req as any, res as any)

      expect(filesManager.sendFileFromSpace).toHaveBeenCalledWith(req.space)
      expect(checks).toHaveBeenCalled()
      expect(stream).toHaveBeenCalledWith(req, res)
      expect(result).toBeInstanceOf(StreamableFile)
    })

    it.each([
      ['LockConflict maps to 423', new LockConflict(null, 'locked'), HttpStatus.LOCKED],
      ['FileError maps to its http code', new FileError(HttpStatus.BAD_REQUEST, 'bad'), HttpStatus.BAD_REQUEST],
      ['generic Error maps to 500', new Error('oops'), HttpStatus.INTERNAL_SERVER_ERROR]
    ])('should map errors (%s)', async (_title, thrown, expectedStatus) => {
      const req = makeReq()
      const res = makeReply()
      const checks = vi.fn().mockRejectedValue(thrown)
      const stream = vi.fn()
      filesManager.sendFileFromSpace.mockReturnValue({ checks, stream })

      await expect(service.download(req as any, res as any)).rejects.toMatchObject({ status: expectedStatus })
    })
  })

  describe('upload', () => {
    it('should upload with checksum OK and return ino', async () => {
      const req = makeReq({ space: { realPath: '/tmp/up.bin', url: '/space/up.bin' } })
      const dto = { checksum: 'abc', size: 10, mtime: 1710000000 }
      filesManager.saveStream.mockResolvedValue('abc')
      fsPromises.stat.mockResolvedValue({ size: 10, ino: 123, mtime: new Date(1710000000 * 1000) })
      vi.mocked(touchFile).mockResolvedValue(undefined)

      const r = await service.upload(req as any, dto as any)
      expect(filesManager.saveStream).toHaveBeenCalledWith(req.user, req.space, req, {
        tmpPath: expect.any(String),
        checksumAlg: SYNC_CHECKSUM_ALG,
        validateTmpFile: expect.any(Function)
      })
      expect(touchFile).toHaveBeenCalledWith('/tmp/up.bin', 1710000000)
      expect(r).toEqual({ ino: 123 })
      expect(removeFiles).not.toHaveBeenCalled()
    })

    it('should reject when checksum mismatches and preserve tmp', async () => {
      const req = makeReq()
      const dto = { checksum: 'abc', size: 10, mtime: 1710000000 }
      filesManager.saveStream.mockImplementation(async (_user, _space, _req, options) => {
        await options.validateTmpFile({ tmpPath: '/tmp/sync-in-file', realPath: req.space.realPath, checksum: 'bad' })
      })
      fsPromises.stat.mockResolvedValue({ size: 10, ino: 123, mtime: new Date(1710000000 * 1000) })

      await expect(service.upload(req as any, dto as any)).rejects.toBeInstanceOf(HttpException)
      expect(removeFiles).not.toHaveBeenCalled()
      expect(touchFile).not.toHaveBeenCalled()
    })

    it('should upload without checksum', async () => {
      const req = makeReq({ space: { realPath: '/tmp/up2.bin', url: '/space/up2.bin' } })
      const dto = { size: 5, mtime: 1710000100 }
      filesManager.saveStream.mockResolvedValue(undefined)
      fsPromises.stat.mockResolvedValue({ size: 5, ino: 321, mtime: new Date(1710000100 * 1000) })

      const r = await service.upload(req as any, dto as any)
      expect(filesManager.saveStream).toHaveBeenCalledWith(req.user, req.space, req, {
        tmpPath: expect.any(String),
        validateTmpFile: expect.any(Function)
      })
      expect(touchFile).toHaveBeenCalledWith('/tmp/up2.bin', 1710000100)
      expect(r).toEqual({ ino: 321 })
    })

    it('should reject when size mismatches and preserve tmp', async () => {
      const req = makeReq()
      const dto = { size: 10, mtime: 1710000100 }
      filesManager.saveStream.mockImplementation(async (_user, _space, _req, options) => {
        await options.validateTmpFile({ tmpPath: '/tmp/sync-in-file', realPath: req.space.realPath })
      })
      fsPromises.stat.mockResolvedValue({ size: 99, ino: 321, mtime: new Date(1710000100 * 1000) })

      await expect(service.upload(req as any, dto as any)).rejects.toBeInstanceOf(HttpException)
      expect(removeFiles).not.toHaveBeenCalled()
      expect(touchFile).not.toHaveBeenCalled()
    })

    it('should reject when tmp file exceeds quota and preserve tmp', async () => {
      const req = makeReq({
        space: { realPath: '/tmp/up.bin', url: '/space/up.bin', storageQuota: 100, willExceedQuota: vi.fn().mockReturnValue(true) }
      })
      const dto = { size: 10, mtime: 1710000100 }
      filesManager.saveStream.mockImplementation(async (_user, _space, _req, options) => {
        await options.validateTmpFile({ tmpPath: '/tmp/sync-in-file', realPath: req.space.realPath })
      })
      fsPromises.stat.mockResolvedValue({ size: 10, ino: 321, mtime: new Date(1710000100 * 1000) })

      await expect(service.upload(req as any, dto as any)).rejects.toBeInstanceOf(HttpException)
      expect(req.space.willExceedQuota).toHaveBeenCalledWith(10)
      expect(removeFiles).not.toHaveBeenCalled()
      expect(touchFile).not.toHaveBeenCalled()
    })
  })

  describe('delete', () => {
    it('should delete successfully', async () => {
      const req = makeReq()
      filesManager.delete.mockResolvedValue(undefined)

      await expect(service.delete(req as any)).resolves.toBeUndefined()
      expect(filesManager.delete).toHaveBeenCalledWith(req.user, req.space)
    })

    it('should map errors via handleError', async () => {
      const req = makeReq()
      filesManager.delete.mockRejectedValue(new LockConflict(null, 'locked'))

      await expect(service.delete(req as any)).rejects.toMatchObject({ status: HttpStatus.LOCKED })
    })
  })

  describe('props', () => {
    it('should touch successfully', async () => {
      const req = makeReq()
      filesManager.touch.mockResolvedValue(undefined)

      await expect(service.props(req as any, { mtime: 1710000200 } as any)).resolves.toBeUndefined()
      expect(filesManager.touch).toHaveBeenCalledWith(req.user, req.space, 1710000200, false)
    })

    it('should map errors via handleError', async () => {
      const req = makeReq()
      filesManager.touch.mockRejectedValue(new FileError(HttpStatus.BAD_REQUEST, 'bad'))

      await expect(service.props(req as any, { mtime: 123 } as any)).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST })
    })
  })

  describe('make', () => {
    it('should create directory and return ino', async () => {
      const req = makeReq({ space: { realPath: '/tmp/newdir', url: '/space/newdir' } })
      filesManager.mkDir.mockResolvedValue(undefined)
      fsPromises.stat.mockResolvedValue({ ino: 555 })
      vi.mocked(touchFile).mockResolvedValue(undefined)

      const r = await service.make(req as any, { type: 'directory', mtime: 1710000300 } as any)
      expect(filesManager.mkDir).toHaveBeenCalledWith(req.user, req.space, true)
      expect(touchFile).toHaveBeenCalledWith('/tmp/newdir', 1710000300)
      expect(r).toEqual({ ino: 555 })
    })

    it('should create file and return ino', async () => {
      const req = makeReq({ space: { realPath: '/tmp/newfile', url: '/space/newfile' } })
      filesManager.mkFile.mockResolvedValue(undefined)
      fsPromises.stat.mockResolvedValue({ ino: 777 })

      const r = await service.make(req as any, { type: 'file', mtime: 1710000400 } as any)
      expect(filesManager.mkFile).toHaveBeenCalledWith(req.user, req.space, true)
      expect(touchFile).toHaveBeenCalledWith('/tmp/newfile', 1710000400)
      expect(r).toEqual({ ino: 777 })
    })

    it('should map errors via handleError', async () => {
      const req = makeReq()
      filesManager.mkDir.mockRejectedValue(new LockConflict(null, 'locked'))

      await expect(service.make(req as any, { type: 'directory', mtime: 0 } as any)).rejects.toMatchObject({ status: HttpStatus.LOCKED })
    })
  })

  describe('copyMove', () => {
    it('should move (no return) and not touch mtime', async () => {
      const req = makeReq()
      const dstSpace = { realPath: '/dst/moved', url: '/space/dst/moved' }
      spacesManager.spaceEnv.mockResolvedValue(dstSpace)
      filesManager.copyMove.mockResolvedValue(undefined)

      const r = await service.copyMove(req as any, { destination: '/dst/moved' } as any, true)
      expect(spacesManager.spaceEnv).toHaveBeenCalled()
      expect(filesManager.copyMove).toHaveBeenCalledWith(req.user, req.space, dstSpace, true, true, true)
      expect(touchFile).not.toHaveBeenCalled()
      expect(r).toBeUndefined()
    })

    it('should copy, touch mtime when provided, and return ino/mtime', async () => {
      const req = makeReq()
      const dstSpace = { realPath: '/dst/copied', url: '/space/dst/copied' }
      spacesManager.spaceEnv.mockResolvedValue(dstSpace)
      filesManager.copyMove.mockResolvedValue(undefined)
      fsPromises.stat.mockResolvedValue({ ino: 999, mtime: new Date(1710000500 * 1000) })

      const r = await service.copyMove(req as any, { destination: '/dst/copied', mtime: 1710000500 } as any, false)
      expect(filesManager.copyMove).toHaveBeenCalledWith(req.user, req.space, dstSpace, false, true, true)
      expect(touchFile).toHaveBeenCalledWith('/dst/copied', 1710000500)
      expect(r).toEqual({ ino: 999, mtime: 1710000500 })
    })

    it('should copy without mtime and still return ino/mtime', async () => {
      const req = makeReq()
      const dstSpace = { realPath: '/dst/copied2', url: '/space/dst/copied2' }
      spacesManager.spaceEnv.mockResolvedValue(dstSpace)
      filesManager.copyMove.mockResolvedValue(undefined)
      fsPromises.stat.mockResolvedValue({ ino: 1001, mtime: new Date(1710000600 * 1000) })

      const r = await service.copyMove(req as any, { destination: '/dst/copied2' } as any, false)
      expect(touchFile).not.toHaveBeenCalled()
      expect(r).toEqual({ ino: 1001, mtime: 1710000600 })
    })

    it('should map errors via handleError', async () => {
      const req = makeReq()
      const dstSpace = { realPath: '/dst/err', url: '/space/dst/err' }
      spacesManager.spaceEnv.mockResolvedValue(dstSpace)
      filesManager.copyMove.mockRejectedValue(new FileError(HttpStatus.BAD_REQUEST, 'bad'))

      await expect(service.copyMove(req as any, { destination: '/dst/err' } as any, false)).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST })
    })

    it('should map errors via handleError for move (isMove=true)', async () => {
      const req = makeReq()
      const dstSpace = { realPath: '/dst/err-move', url: '/space/dst/err-move' }
      spacesManager.spaceEnv.mockResolvedValue(dstSpace)
      filesManager.copyMove.mockRejectedValue(new LockConflict(null, 'locked'))

      const spy = vi.spyOn(service as any, 'handleError')

      await expect(service.copyMove(req as any, { destination: '/dst/err-move' } as any, true)).rejects.toMatchObject({
        status: HttpStatus.LOCKED
      })

      expect(spy).toHaveBeenCalledWith(req.space, FILE_OPERATION.MOVE, expect.anything(), dstSpace)
    })
  })

  describe('parseSyncPath', () => {
    it('should delegate to parseFiles and yield file stats from the base directory', async () => {
      const base = '/base-sync'
      const space = { realPath: base, url: '/space-sync', quotaIsExceeded: false }
      const dirent = { name: 'afile', parentPath: base, isDirectory: () => false, isFile: () => true }
      fsPromises.readdir.mockResolvedValue([dirent])
      fsPromises.stat.mockResolvedValue({ isDirectory: () => false, isFile: () => true, size: 42, ino: 7, mtime: new Date(1234 * 1000) })

      const syncDiff: any = { defaultFilters: new Set(), secureDiff: false, firstSync: true, snapshot: new Map() }

      const out = await collect<Record<string, any>>((service as any).parseSyncPath(space, syncDiff))

      expect(out.length).toBe(1)
      expect(out[0]).toHaveProperty('/afile')
      const stats = out[0]['/afile']
      expect(Array.isArray(stats)).toBe(true)
      expect(stats[F_STAT.IS_DIR]).toBe(false)
      expect(stats[F_STAT.SIZE]).toBe(42)
      expect(stats[F_STAT.MTIME]).toBe(1234)
      expect(stats[F_STAT.INO]).toBe(7)
      expect(stats[F_STAT.CHECKSUM]).toBeNull()
    })
  })

  describe('diff', () => {
    it('should fail when clientId is missing', async () => {
      const res = makeReply()
      await expect(service.diff({ id: 1 } as any, 1, {} as any, res as any)).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST })
    })

    it('should fail when path settings not found', async () => {
      const res = makeReply()
      const user = { id: 1, clientId: 9 } as any
      syncQueries.getPathSettings.mockResolvedValue(undefined)
      await expect(service.diff(user, 1, {} as any, res as any)).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND })
    })

    it('should map spaceEnv thrown error to BAD_REQUEST', async () => {
      const res = makeReply()
      const user = { id: 1, clientId: 9 } as any
      syncQueries.getPathSettings.mockResolvedValue({ remotePath: '/base' })
      spacesManager.spaceEnv.mockRejectedValue(new Error('boom'))

      await expect(service.diff(user, 1, {} as any, res as any)).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST, message: 'boom' })
    })

    it('should fail when space not found', async () => {
      const res = makeReply()
      const user = { id: 1, clientId: 9 } as any
      syncQueries.getPathSettings.mockResolvedValue({ remotePath: '/base' })
      spacesManager.spaceEnv.mockResolvedValue(undefined)

      await expect(service.diff(user, 1, {} as any, res as any)).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND })
    })

    it('should fail when space quota exceeded', async () => {
      const res = makeReply()
      const user = { id: 1, clientId: 9 } as any
      syncQueries.getPathSettings.mockResolvedValue({ remotePath: '/base' })
      spacesManager.spaceEnv.mockResolvedValue({ realPath: '/base', url: '/space', quotaIsExceeded: true })

      await expect(service.diff(user, 1, {} as any, res as any)).rejects.toMatchObject({ status: HttpStatus.INSUFFICIENT_STORAGE })
    })

    it('should fail when remote path does not exist', async () => {
      const res = makeReply()
      const user = { id: 1, clientId: 9 } as any
      syncQueries.getPathSettings.mockResolvedValue({ remotePath: '/base' })
      spacesManager.spaceEnv.mockResolvedValue({ realPath: '/base', url: '/space', quotaIsExceeded: false })
      vi.mocked(isPathExists).mockResolvedValue(false)

      await expect(service.diff(user, 1, {} as any, res as any)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Remote path not found : /base'
      })
    })

    it('should fail when remote path is not a directory', async () => {
      const res = makeReply()
      const user = { id: 1, clientId: 9 } as any
      syncQueries.getPathSettings.mockResolvedValue({ remotePath: '/base' })
      spacesManager.spaceEnv.mockResolvedValue({ realPath: '/base', url: '/space', quotaIsExceeded: false })
      vi.mocked(isPathExists).mockResolvedValue(true)
      vi.mocked(isPathIsDir).mockResolvedValue(false)

      await expect(service.diff(user, 1, {} as any, res as any)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Remote path must be a directory'
      })
    })

    it('should stream diff results successfully', async () => {
      const res = makeReply()
      const user = { id: 1, clientId: 9 } as any
      syncQueries.getPathSettings.mockResolvedValue({ remotePath: '/base' })
      const space = { realPath: '/base', url: '/space', quotaIsExceeded: false }
      spacesManager.spaceEnv.mockResolvedValue(space)
      vi.mocked(isPathExists).mockResolvedValue(true)
      vi.mocked(isPathIsDir).mockResolvedValue(true)

      const gen = async function* () {
        yield { '/file1': [false, 1, 2, 3, 'x'] }
        yield { '/file2': [true, 0, 2, 4, null] }
      }
      vi.spyOn(service as any, 'parseSyncPath').mockImplementation(() => gen())

      await service.diff(user, 1, { secureDiff: false } as any, res as any)

      expect(res.raw.writeHead).toHaveBeenCalledWith(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked'
      })
      expect(res.raw.write).toHaveBeenCalledWith(`${JSON.stringify({ '/file1': [false, 1, 2, 3, 'x'] })}\n`)
      expect(res.raw.write).toHaveBeenCalledWith(`${JSON.stringify({ '/file2': [true, 0, 2, 4, null] })}\n`)
      expect(res.raw.write).toHaveBeenCalledWith(SYNC_DIFF_DONE)
      expect(res.raw.end).toHaveBeenCalled()
    })

    it('should handle error during streaming and set status 500', async () => {
      const res = makeReply()
      const user = { id: 1, clientId: 9 } as any
      syncQueries.getPathSettings.mockResolvedValue({ remotePath: '/base' })
      const space = { realPath: '/base', url: '/space', quotaIsExceeded: false }
      spacesManager.spaceEnv.mockResolvedValue(space)
      vi.mocked(isPathExists).mockResolvedValue(true)
      vi.mocked(isPathIsDir).mockResolvedValue(true)

      vi.spyOn(service as any, 'parseSyncPath').mockImplementation(() => {
        throw new Error('parse error')
      })

      await service.diff(user, 1, {} as any, res as any)

      expect(res.raw.write).toHaveBeenCalledWith('parse error\n')
      expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR)
      expect(res.raw.end).toHaveBeenCalled()
    })
  })

  describe('internal parseFiles/analyzeFile coverage', () => {
    const makeDirent = (name: string, parentPath: string, kind: 'dir' | 'file' | 'other') => ({
      name,
      parentPath,
      isDirectory: () => kind === 'dir',
      isFile: () => kind === 'file'
    })

    it('should walk directory, ignore special files, filter by name/path, reuse snapshot checksum, and compute checksum when needed', async () => {
      const base = '/base'
      const ctx: any = {
        regexBasePath: new RegExp('^/base'),
        syncDiff: {
          defaultFilters: new Set<string>(['ignoredName']),
          pathFilters: /file2/,
          secureDiff: true,
          firstSync: false,
          snapshot: new Map<string, any>([['/file3', [false, 100, 1000, 33, 'snaphash']]])
        }
      }

      fsPromises.readdir.mockImplementation(async (dir: string) => {
        if (dir === base) {
          return [
            makeDirent('special', base, 'other'),
            makeDirent('dir1', base, 'dir'),
            makeDirent('ignoredName', base, 'file'),
            makeDirent('fileStatError', base, 'file'),
            makeDirent('file2', base, 'file'),
            makeDirent('file3', base, 'file'),
            makeDirent('file4', base, 'file')
          ]
        }
        if (dir === path.join(base, 'dir1')) return []
        return []
      })

      const mtimeDate = new Date(1000 * 1000)
      fsPromises.stat.mockImplementation(async (p: string) => {
        switch (p) {
          case path.join(base, 'dir1'):
            return { isDirectory: () => true, isFile: () => false, size: 0, ino: 11, mtime: mtimeDate }
          case path.join(base, 'fileStatError'):
            throw new Error('stat fail')
          case path.join(base, 'file2'):
            return { isDirectory: () => false, isFile: () => true, size: 10, ino: 22, mtime: mtimeDate }
          case path.join(base, 'file3'):
            return { isDirectory: () => false, isFile: () => true, size: 100, ino: 33, mtime: new Date(1000 * 1000) }
          case path.join(base, 'file4'):
            return { isDirectory: () => false, isFile: () => true, size: 200, ino: 44, mtime: new Date(2000 * 1000) }
          default:
            return { isDirectory: () => false, isFile: () => false, size: 0, ino: 0, mtime: new Date() }
        }
      })
      vi.mocked(checksumFile).mockResolvedValue('computed-hash')

      const results = await collect<Record<string, any>>((service as any).parseFiles(base, ctx))

      const keys = results.map((o) => Object.keys(o)[0]).sort()
      expect(keys).toEqual(['/dir1', '/file2', '/file3', '/file4', '/fileStatError'])

      const fileStatError = results.find((o) => o['/fileStatError'])
      expect(fileStatError?.['/fileStatError'][0]).toBe(F_SPECIAL_STAT.ERROR)
      expect(fileStatError?.['/fileStatError'][1]).toContain('stat fail')

      const filtered = results.find((o) => o['/file2'])
      expect(filtered?.['/file2'][0]).toBe(F_SPECIAL_STAT.FILTERED)

      const reused = results.find((o) => o['/file3'])?.['/file3']
      expect(reused[F_STAT.CHECKSUM]).toBe('snaphash')
      expect(checksumFile).toHaveBeenCalledTimes(1)

      const computed = results.find((o) => o['/file4'])?.['/file4']
      expect(computed[F_STAT.CHECKSUM]).toBe('computed-hash')
    })

    it('should throw a generic error when readdir fails', async () => {
      fsPromises.readdir.mockRejectedValue(new Error('readdir fail'))

      const ctx: any = { regexBasePath: /./, syncDiff: { defaultFilters: new Set(), secureDiff: false } }
      const iter = (service as any).parseFiles('/any', ctx)

      await expect(
        (async () => {
          for await (const _ of iter) {
            /* consume */
          }
        })()
      ).rejects.toThrow('Unable to parse path')
    })

    it('should return ERROR when checkSumFile throws during analyzeFile', async () => {
      const base = '/base'
      const dirent = { name: 'badfile', parentPath: base, isDirectory: () => false, isFile: () => true }

      fsPromises.readdir.mockImplementation(async (dir: string) => (dir === base ? [dirent] : []))
      fsPromises.stat.mockResolvedValue({ isDirectory: () => false, isFile: () => true, size: 10, ino: 42, mtime: new Date(1234 * 1000) })

      vi.spyOn(service as any, 'checkSumFile').mockRejectedValue(new Error('checksum fail'))

      const ctx: any = {
        regexBasePath: new RegExp('^/base'),
        syncDiff: { defaultFilters: new Set<string>(), pathFilters: undefined, secureDiff: true, firstSync: false, snapshot: new Map<string, any>() }
      }

      const results = await collect<Record<string, any>>((service as any).parseFiles(base, ctx))

      expect(results).toHaveLength(1)
      expect(results[0]).toHaveProperty('/badfile')
      const out = results[0]['/badfile']
      expect(Array.isArray(out)).toBe(true)
      expect(out[0]).toBe(F_SPECIAL_STAT.ERROR)
      expect(String(out[1])).toContain('checksum fail')
    })
  })
})
