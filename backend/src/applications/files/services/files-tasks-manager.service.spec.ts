import { Test, TestingModule } from '@nestjs/testing'
import { HttpException, HttpStatus } from '@nestjs/common'
import crypto from 'node:crypto'
import { Cache } from '../../../infrastructure/cache/cache.service'
import * as filesUtils from '../utils/files'
import { FileTaskEvent } from '../events/file-events'
import { SendFile } from '../utils/send-file'
import { FILE_OPERATION } from '../constants/operations'
import { CACHE_TASK_PREFIX, CACHE_TASK_TTL } from '../constants/cache'
import { FileTaskStatus } from '../models/file-task'
import { FilesMethods } from './files-methods.service'
import { FilesTasksManager } from './files-tasks-manager.service'

describe(FilesTasksManager.name, () => {
  let filesTasksManager: FilesTasksManager
  let module: TestingModule
  let filesMethods: {
    doWork: jest.Mock
  }
  let cacheStore: Map<string, any>
  let cache: {
    set: jest.Mock
    get: jest.Mock
    keys: jest.Mock
    mget: jest.Mock
    del: jest.Mock
  }

  const flushPromises = async () => {
    await new Promise((resolve) => setImmediate(resolve))
    await new Promise((resolve) => setImmediate(resolve))
  }

  const createPatternRegex = (pattern: string): RegExp => {
    const escapedPattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
    return new RegExp(`^${escapedPattern}$`)
  }

  beforeEach(async () => {
    cacheStore = new Map<string, any>()
    cache = {
      set: jest.fn(async (key: string, value: unknown) => {
        cacheStore.set(key, value)
        return true
      }),
      get: jest.fn(async (key: string) => cacheStore.get(key)),
      keys: jest.fn(async (pattern: string) => [...cacheStore.keys()].filter((k) => createPatternRegex(pattern).test(k))),
      mget: jest.fn(async (keys: string[]) => keys.map((k) => cacheStore.get(k)).filter((v) => v !== undefined)),
      del: jest.fn(async (key: string) => cacheStore.delete(key))
    }
    filesMethods = {
      doWork: jest.fn()
    }
    module = await Test.createTestingModule({
      providers: [
        FilesTasksManager,
        {
          provide: Cache,
          useValue: cache
        },
        { provide: FilesMethods, useValue: filesMethods }
      ]
    }).compile()

    module.useLogger(['fatal'])
    filesTasksManager = module.get<FilesTasksManager>(FilesTasksManager)
  })

  afterEach(async () => {
    await module.close()
    jest.restoreAllMocks()
    jest.clearAllMocks()
  })

  it('should be defined', () => {
    expect(filesTasksManager).toBeDefined()
  })

  it('should unref watchers and clear them on module destroy', async () => {
    const cacheKey = 'task-1'
    const listenersBeforeDestroy = FileTaskEvent.listenerCount('startWatch')
    const space = { task: { cacheKey, props: {} } } as any
    cacheStore.set(cacheKey, { props: {} })
    ;(filesTasksManager as any).startWatch(space, FILE_OPERATION.COPY, '/files/document.txt')

    const watcher = (filesTasksManager as any).tasksWatcher[cacheKey] as NodeJS.Timeout
    expect(watcher.hasRef()).toBe(false)

    filesTasksManager.onModuleDestroy()

    expect((filesTasksManager as any).tasksWatcher).toEqual({})
    expect(FileTaskEvent.listenerCount('startWatch')).toBe(listenersBeforeDestroy - 1)
  })

  it('should build task cache key with and without task id', () => {
    expect(FilesTasksManager.getCacheKey(10, 'task-1')).toBe(`${CACHE_TASK_PREFIX}-10-task-1`)
    expect(FilesTasksManager.getCacheKey(10)).toBe(`${CACHE_TASK_PREFIX}-10-*`)
  })

  it('should watch a temporary path while keeping the published file name', () => {
    const startWatchSpy = jest.spyOn(filesTasksManager as any, 'startWatch').mockResolvedValueOnce(undefined)
    const space = { url: 'files/personal/archive.zip', task: { cacheKey: 'task-1', props: {} } } as any

    FileTaskEvent.emit('startWatch', space, FILE_OPERATION.DECOMPRESS, '/files/archive', '/tmp/archive-extract')

    expect(startWatchSpy).toHaveBeenCalledWith(
      space,
      FILE_OPERATION.DECOMPRESS,
      '/tmp/archive-extract',
      'files/personal',
      'archive',
      '/files/archive'
    )
  })

  it('should watch the published archive after the temporary archive has been moved', async () => {
    const pathExistsSpy = jest.spyOn(filesUtils, 'isPathExists').mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const fileSizeSpy = jest.spyOn(filesUtils, 'fileSize').mockResolvedValueOnce(42)
    const updateTaskSpy = jest.spyOn(filesTasksManager as any, 'updateTask').mockResolvedValueOnce(undefined)
    const space = { task: { cacheKey: 'task-1', props: {} } } as any

    await (filesTasksManager as any).updateCompressTask(space, '/tmp/archive-compress-uuid', '/files/archive.tgz')

    expect(pathExistsSpy).toHaveBeenNthCalledWith(1, '/tmp/archive-compress-uuid')
    expect(pathExistsSpy).toHaveBeenNthCalledWith(2, '/files/archive.tgz')
    expect(fileSizeSpy).toHaveBeenCalledWith('/files/archive.tgz')
    expect(space.task.props.size).toBe(42)
    expect(updateTaskSpy).toHaveBeenCalledWith('task-1', { size: 42 })
  })

  it('should retry the published archive when the temporary archive is moved before reading it', async () => {
    const missingError = Object.assign(new Error('missing temporary archive'), { code: 'ENOENT' })
    const pathExistsSpy = jest.spyOn(filesUtils, 'isPathExists').mockResolvedValueOnce(true).mockResolvedValueOnce(true)
    const fileSizeSpy = jest.spyOn(filesUtils, 'fileSize').mockRejectedValueOnce(missingError).mockResolvedValueOnce(42)
    const updateTaskSpy = jest.spyOn(filesTasksManager as any, 'updateTask').mockResolvedValueOnce(undefined)
    const space = { task: { cacheKey: 'task-1', props: {} } } as any

    await (filesTasksManager as any).updateCompressTask(space, '/tmp/archive-compress-uuid', '/files/archive.tgz')

    expect(pathExistsSpy).toHaveBeenNthCalledWith(1, '/tmp/archive-compress-uuid')
    expect(pathExistsSpy).toHaveBeenNthCalledWith(2, '/files/archive.tgz')
    expect(fileSizeSpy).toHaveBeenNthCalledWith(1, '/tmp/archive-compress-uuid')
    expect(fileSizeSpy).toHaveBeenNthCalledWith(2, '/files/archive.tgz')
    expect(space.task.props.size).toBe(42)
    expect(updateTaskSpy).toHaveBeenCalledWith('task-1', { size: 42 })
  })

  it('should retry the published directory when the temporary directory is moved while reading it', async () => {
    const pathExistsSpy = jest.spyOn(filesUtils, 'isPathExists').mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const countDirEntriesSpy = jest
      .spyOn(filesUtils, 'countDirEntries')
      .mockResolvedValueOnce({ files: 0, directories: 0 })
      .mockResolvedValueOnce({ files: 2, directories: 1 })
    const updateTaskSpy = jest.spyOn(filesTasksManager as any, 'updateTask').mockResolvedValueOnce(undefined)
    const space = { task: { cacheKey: 'task-1', props: {} } } as any

    await (filesTasksManager as any).updateDecompressTask(space, '/tmp/archive-extract-uuid', '/files/archive')

    expect(pathExistsSpy).toHaveBeenNthCalledWith(1, '/tmp/archive-extract-uuid')
    expect(pathExistsSpy).toHaveBeenNthCalledWith(2, '/tmp/archive-extract-uuid')
    expect(pathExistsSpy).toHaveBeenNthCalledWith(3, '/files/archive')
    expect(countDirEntriesSpy).toHaveBeenNthCalledWith(1, '/tmp/archive-extract-uuid')
    expect(countDirEntriesSpy).toHaveBeenNthCalledWith(2, '/files/archive')
    expect(space.task.props).toEqual({ files: 2, directories: 1 })
    expect(updateTaskSpy).toHaveBeenCalledWith('task-1', { files: 2, directories: 1 })
  })

  it('should silently skip watcher update while temporary and published paths are missing', async () => {
    jest.spyOn(filesUtils, 'isPathExists').mockResolvedValue(false)
    const fileSizeSpy = jest.spyOn(filesUtils, 'fileSize')
    const loggerErrorSpy = jest.spyOn((filesTasksManager as any).logger, 'error')
    const stopWatchSpy = jest.spyOn(filesTasksManager as any, 'stopWatch').mockResolvedValueOnce(undefined)
    const updateTaskSpy = jest.spyOn(filesTasksManager as any, 'updateTask').mockResolvedValueOnce(undefined)
    const space = { task: { cacheKey: 'task-1', props: {} } } as any

    await (filesTasksManager as any).updateCompressTask(space, '/tmp/archive-compress-uuid', '/files/archive.tgz')

    expect(loggerErrorSpy).not.toHaveBeenCalled()
    expect(stopWatchSpy).not.toHaveBeenCalled()
    expect(updateTaskSpy).not.toHaveBeenCalled()
    expect(fileSizeSpy).not.toHaveBeenCalled()
  })

  it('should stop a watcher without staging when its path is missing', async () => {
    const missingError = Object.assign(new Error('missing archive'), { code: 'ENOENT' })
    jest.spyOn(filesUtils, 'fileSize').mockRejectedValueOnce(missingError)
    const loggerErrorSpy = jest.spyOn((filesTasksManager as any).logger, 'error')
    const stopWatchSpy = jest.spyOn(filesTasksManager as any, 'stopWatch').mockResolvedValueOnce(undefined)
    const space = { task: { cacheKey: 'task-1', props: {} } } as any

    await (filesTasksManager as any).updateCompressTask(space, '/files/archive.tgz')

    expect(loggerErrorSpy).toHaveBeenCalled()
    expect(stopWatchSpy).toHaveBeenCalledWith('task-1')
  })

  it('should create a task and mark it as success when the async method resolves', async () => {
    jest.spyOn(crypto, 'randomUUID').mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
    filesMethods.doWork.mockResolvedValueOnce({ props: { totalSize: 99 }, result: 'done' })
    const user = { id: 7 } as any
    const space = { url: 'files/personal/document.txt' } as any

    const task = await filesTasksManager.createTask(FILE_OPERATION.COPY, user, space, { foo: 'bar' }, 'doWork')
    await flushPromises()

    expect(task.id).toBe('11111111-1111-4111-8111-111111111111')
    expect(task.status).toBe(FileTaskStatus.SUCCESS)
    expect(space.task.cacheKey).toBe(`${CACHE_TASK_PREFIX}-7-11111111-1111-4111-8111-111111111111`)
    expect(filesMethods.doWork).toHaveBeenCalledWith(user, space, { foo: 'bar' })
    expect(cache.set).toHaveBeenCalledWith(
      `${CACHE_TASK_PREFIX}-7-11111111-1111-4111-8111-111111111111`,
      expect.objectContaining({ id: '11111111-1111-4111-8111-111111111111', status: FileTaskStatus.SUCCESS, result: 'done' }),
      CACHE_TASK_TTL
    )
    const storedTask = cacheStore.get(`${CACHE_TASK_PREFIX}-7-11111111-1111-4111-8111-111111111111`)
    expect(storedTask.status).toBe(FileTaskStatus.SUCCESS)
    expect(storedTask.endedAt).toBeDefined()
    expect(storedTask.props.totalSize).toBe(99)
  })

  it('should create a task and mark it as error when the async method fails', async () => {
    jest.spyOn(crypto, 'randomUUID').mockReturnValueOnce('22222222-2222-4222-8222-222222222222')
    filesMethods.doWork.mockRejectedValueOnce(new Error('operation failed'))
    const user = { id: 7 } as any
    const space = { url: 'files/personal/document.txt' } as any

    await filesTasksManager.createTask(FILE_OPERATION.MOVE, user, space, null, 'doWork')
    await flushPromises()

    const storedTask = cacheStore.get(`${CACHE_TASK_PREFIX}-7-22222222-2222-4222-8222-222222222222`)
    expect(storedTask.status).toBe(FileTaskStatus.ERROR)
    expect(storedTask.result).toBe('operation failed')
  })

  it('should return one task by id and throw when it does not exist', async () => {
    cacheStore.set(`${CACHE_TASK_PREFIX}-11-task-a`, { id: 'task-a' })

    await expect(filesTasksManager.getTasks(11, 'task-a')).resolves.toEqual({ id: 'task-a' })
    await expect(filesTasksManager.getTasks(11, 'missing')).rejects.toEqual(new HttpException('Task not found', HttpStatus.NOT_FOUND))
  })

  it('should return all tasks for a user when no task id is provided', async () => {
    cacheStore.set(`${CACHE_TASK_PREFIX}-15-task-1`, { id: 'task-1' })
    cacheStore.set(`${CACHE_TASK_PREFIX}-15-task-2`, { id: 'task-2' })
    cacheStore.set(`${CACHE_TASK_PREFIX}-99-task-9`, { id: 'task-9' })

    const tasks = await filesTasksManager.getTasks(15)

    expect(cache.keys).toHaveBeenCalledWith(`${CACHE_TASK_PREFIX}-15-*`)
    expect(tasks).toEqual([{ id: 'task-1' }, { id: 'task-2' }])
  })

  it('should delete completed task, remove archive file and delete cache entry', async () => {
    const removeFilesSpy = jest.spyOn(filesUtils, 'removeFiles').mockResolvedValueOnce(undefined)
    const stopWatchSpy = jest.spyOn(filesTasksManager as any, 'stopWatch').mockResolvedValueOnce(undefined)
    const user = { id: 22, tasksPath: '/tmp/tasks' } as any
    cacheStore.set(`${CACHE_TASK_PREFIX}-22-task-ok`, {
      id: 'task-ok',
      name: 'archive.tar',
      status: FileTaskStatus.SUCCESS,
      props: { compressInDirectory: false }
    })

    await filesTasksManager.deleteTasks(user, 'task-ok')

    expect(removeFilesSpy).toHaveBeenCalledWith('/tmp/tasks/archive.tar')
    expect(stopWatchSpy).toHaveBeenCalledWith(`${CACHE_TASK_PREFIX}-22-task-ok`)
    expect(cache.del).toHaveBeenCalledWith(`${CACHE_TASK_PREFIX}-22-task-ok`)
  })

  it('should ignore pending tasks when deleting all tasks', async () => {
    const removeFilesSpy = jest.spyOn(filesUtils, 'removeFiles').mockResolvedValue(undefined)
    const stopWatchSpy = jest.spyOn(filesTasksManager as any, 'stopWatch').mockResolvedValue(undefined)
    const user = { id: 31, tasksPath: '/tmp/tasks' } as any
    cacheStore.set(`${CACHE_TASK_PREFIX}-31-task-pending`, {
      id: 'task-pending',
      status: FileTaskStatus.PENDING,
      props: { compressInDirectory: false }
    })
    cacheStore.set(`${CACHE_TASK_PREFIX}-31-task-done`, {
      id: 'task-done',
      name: 'done.tar',
      status: FileTaskStatus.SUCCESS,
      props: { compressInDirectory: true }
    })

    await filesTasksManager.deleteTasks(user)

    expect(cache.keys).toHaveBeenCalledWith(`${CACHE_TASK_PREFIX}-31-*`)
    expect(removeFilesSpy).not.toHaveBeenCalled()
    expect(stopWatchSpy).toHaveBeenCalledTimes(1)
    expect(cache.del).toHaveBeenCalledTimes(1)
    expect(cache.del).toHaveBeenCalledWith(`${CACHE_TASK_PREFIX}-31-task-done`)
  })

  it('should reject archive download when task is not applicable', async () => {
    cacheStore.set(`${CACHE_TASK_PREFIX}-40-task-a`, {
      id: 'task-a',
      status: FileTaskStatus.PENDING,
      props: { compressInDirectory: false }
    })

    await expect(filesTasksManager.downloadArchive({ id: 40, tasksPath: '/tmp/tasks' } as any, 'task-a', {} as any, {} as any)).rejects.toEqual(
      new HttpException('Not applicable', HttpStatus.BAD_REQUEST)
    )
  })

  it('should map send-file checks error to HttpException during archive download', async () => {
    cacheStore.set(`${CACHE_TASK_PREFIX}-50-task-ok`, {
      id: 'task-ok',
      name: 'archive.tar',
      status: FileTaskStatus.SUCCESS,
      props: { compressInDirectory: false }
    })
    jest.spyOn(SendFile.prototype, 'checks').mockRejectedValueOnce({ message: 'Location not found', httpCode: 404 } as any)

    try {
      await filesTasksManager.downloadArchive({ id: 50, tasksPath: '/tmp/tasks' } as any, 'task-ok', {} as any, {} as any)
      fail('downloadArchive should throw')
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException)
      expect((e as HttpException).getStatus()).toBe(404)
      expect((e as HttpException).message).toBe('Location not found')
    }
  })

  it('should stream archive when task is valid', async () => {
    const streamable = { ok: true } as any
    cacheStore.set(`${CACHE_TASK_PREFIX}-60-task-ok`, {
      id: 'task-ok',
      name: 'archive.tar',
      status: FileTaskStatus.SUCCESS,
      props: { compressInDirectory: false }
    })
    jest.spyOn(SendFile.prototype, 'checks').mockResolvedValueOnce(undefined)
    jest.spyOn(SendFile.prototype, 'stream').mockResolvedValueOnce(streamable)

    const result = await filesTasksManager.downloadArchive({ id: 60, tasksPath: '/tmp/tasks' } as any, 'task-ok', { raw: {} } as any, {} as any)

    expect(result).toBe(streamable)
  })
})
