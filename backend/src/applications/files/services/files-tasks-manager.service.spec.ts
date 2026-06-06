import { Test, TestingModule } from '@nestjs/testing'
import { HttpException, HttpStatus } from '@nestjs/common'
import crypto from 'node:crypto'
import { Cache } from '../../../infrastructure/cache/cache.service'
import * as filesUtils from '../utils/files'
import { FileTaskEvent } from '../events/file-events'
import { SendFile } from '../utils/send-file'
import { FILE_OPERATION } from '../constants/operations'
import { CACHE_TASK_CANCEL_PREFIX, CACHE_TASK_PREFIX, CACHE_TASK_TTL, CACHE_TASK_USER_PREFIX } from '../constants/cache'
import { FileTaskStatus } from '../models/file-task'
import { FilesMethods } from './files-methods.service'
import { FilesTasksManager } from './files-tasks-manager.service'
import { FilesTasksQueue } from './files-tasks-queue.service'
import { Mock } from 'vitest'

describe(FilesTasksManager.name, () => {
  let filesTasksManager: FilesTasksManager
  let module: TestingModule
  let filesMethods: {
    doWork: Mock
  }
  let cacheStore: Map<string, any>
  let cache: {
    set: Mock
    get: Mock
    keys: Mock
    mget: Mock
    increment: Mock
    del: Mock
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
      set: vi.fn(async (key: string, value: unknown) => {
        cacheStore.set(key, value)
        return true
      }),
      get: vi.fn(async (key: string) => cacheStore.get(key)),
      keys: vi.fn(async (pattern: string) => [...cacheStore.keys()].filter((k) => createPatternRegex(pattern).test(k))),
      mget: vi.fn(async (keys: string[]) => keys.map((k) => cacheStore.get(k)).filter((v) => v !== undefined)),
      increment: vi.fn(async (key: string, amount = 1) => {
        const value = (Number(cacheStore.get(key)) || 0) + amount
        cacheStore.set(key, value)
        return value
      }),
      del: vi.fn(async (key: string) => cacheStore.delete(key))
    }
    filesMethods = {
      doWork: vi.fn()
    }
    module = await Test.createTestingModule({
      providers: [
        FilesTasksManager,
        FilesTasksQueue,
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
    vi.restoreAllMocks()
    vi.clearAllMocks()
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
    expect(FilesTasksManager.getCancellationCacheKey(10, 'task-1')).toBe(`${CACHE_TASK_CANCEL_PREFIX}-10-task-1`)
    expect(FilesTasksQueue.getUserRunningTasksCacheKey(10)).toBe(`${CACHE_TASK_USER_PREFIX}-10`)
  })

  it('should request cancellation through cache for a pending supported task', async () => {
    cacheStore.set(`${CACHE_TASK_PREFIX}-15-task-1`, {
      id: 'task-1',
      type: FILE_OPERATION.DOWNLOAD,
      status: FileTaskStatus.PENDING
    })

    await filesTasksManager.cancelTask(15, 'task-1')

    expect(cache.set).toHaveBeenCalledWith(`${CACHE_TASK_CANCEL_PREFIX}-15-task-1`, true, CACHE_TASK_TTL)
  })

  it('should abort a cancellable task and store a cancelled status when cancellation is requested', async () => {
    vi.useFakeTimers()
    try {
      const taskId = '33333333-3333-4333-8333-333333333333'
      const user = { id: 7 } as any
      const space = { url: 'files/personal/document.txt' } as any
      const cacheKey = `${CACHE_TASK_PREFIX}-7-${taskId}`
      const cancellationCacheKey = `${CACHE_TASK_CANCEL_PREFIX}-7-${taskId}`
      let taskSignal!: AbortSignal

      vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce(taskId)
      filesMethods.doWork.mockImplementationOnce((_user, _space, _dto, signal?: AbortSignal) => {
        if (!signal) return Promise.reject(new Error('missing abort signal'))
        taskSignal = signal
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        })
      })

      await filesTasksManager.createTask(FILE_OPERATION.DOWNLOAD, user, space, null, 'doWork')
      cacheStore.set(cancellationCacheKey, true)

      await vi.advanceTimersByTimeAsync(1000)
      for (let i = 0; i < 6; i++) await Promise.resolve()

      const storedTask = cacheStore.get(cacheKey)
      expect(filesMethods.doWork).toHaveBeenCalledWith(user, space, null, expect.any(AbortSignal))
      expect(taskSignal.aborted).toBe(true)
      expect(storedTask.status).toBe(FileTaskStatus.CANCELLED)
      expect(storedTask.result).toBe('Cancelled')
      expect(cacheStore.has(cancellationCacheKey)).toBe(false)
      expect((filesTasksManager as any).tasksCancellationWatcher).toEqual({})
    } finally {
      vi.useRealTimers()
    }
  })

  it('should watch a temporary path while keeping the published file name', () => {
    const startWatchSpy = vi.spyOn(filesTasksManager as any, 'startWatch').mockResolvedValueOnce(undefined)
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
    const pathExistsSpy = vi.spyOn(filesUtils, 'isPathExists').mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const fileSizeSpy = vi.spyOn(filesUtils, 'fileSize').mockResolvedValueOnce(42)
    const updateTaskSpy = vi.spyOn(filesTasksManager as any, 'updateTask').mockResolvedValueOnce(undefined)
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
    const pathExistsSpy = vi.spyOn(filesUtils, 'isPathExists').mockResolvedValueOnce(true).mockResolvedValueOnce(true)
    const fileSizeSpy = vi.spyOn(filesUtils, 'fileSize').mockRejectedValueOnce(missingError).mockResolvedValueOnce(42)
    const updateTaskSpy = vi.spyOn(filesTasksManager as any, 'updateTask').mockResolvedValueOnce(undefined)
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
    const pathExistsSpy = vi.spyOn(filesUtils, 'isPathExists').mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const countDirEntriesSpy = vi
      .spyOn(filesUtils, 'countDirEntries')
      .mockResolvedValueOnce({ files: 0, directories: 0 })
      .mockResolvedValueOnce({ files: 2, directories: 1 })
    const updateTaskSpy = vi.spyOn(filesTasksManager as any, 'updateTask').mockResolvedValueOnce(undefined)
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
    vi.spyOn(filesUtils, 'isPathExists').mockResolvedValue(false)
    const fileSizeSpy = vi.spyOn(filesUtils, 'fileSize')
    const loggerErrorSpy = vi.spyOn((filesTasksManager as any).logger, 'error')
    const stopWatchSpy = vi.spyOn(filesTasksManager as any, 'stopWatch').mockResolvedValueOnce(undefined)
    const updateTaskSpy = vi.spyOn(filesTasksManager as any, 'updateTask').mockResolvedValueOnce(undefined)
    const space = { task: { cacheKey: 'task-1', props: {} } } as any

    await (filesTasksManager as any).updateCompressTask(space, '/tmp/archive-compress-uuid', '/files/archive.tgz')

    expect(loggerErrorSpy).not.toHaveBeenCalled()
    expect(stopWatchSpy).not.toHaveBeenCalled()
    expect(updateTaskSpy).not.toHaveBeenCalled()
    expect(fileSizeSpy).not.toHaveBeenCalled()
  })

  it('should stop a watcher without staging when its path is missing', async () => {
    const missingError = Object.assign(new Error('missing archive'), { code: 'ENOENT' })
    vi.spyOn(filesUtils, 'fileSize').mockRejectedValueOnce(missingError)
    const loggerErrorSpy = vi.spyOn((filesTasksManager as any).logger, 'error')
    const stopWatchSpy = vi.spyOn(filesTasksManager as any, 'stopWatch').mockResolvedValueOnce(undefined)
    const space = { task: { cacheKey: 'task-1', props: {} } } as any

    await (filesTasksManager as any).updateCompressTask(space, '/files/archive.tgz')

    expect(loggerErrorSpy).toHaveBeenCalled()
    expect(stopWatchSpy).toHaveBeenCalledWith('task-1')
  })

  it('should create a task and mark it as success when the async method resolves', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
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
    vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce('22222222-2222-4222-8222-222222222222')
    filesMethods.doWork.mockRejectedValueOnce(new Error('operation failed'))
    const user = { id: 7 } as any
    const space = { url: 'files/personal/document.txt' } as any

    await filesTasksManager.createTask(FILE_OPERATION.MOVE, user, space, null, 'doWork')
    await flushPromises()

    const storedTask = cacheStore.get(`${CACHE_TASK_PREFIX}-7-22222222-2222-4222-8222-222222222222`)
    expect(storedTask.status).toBe(FileTaskStatus.ERROR)
    expect(storedTask.result).toBe('operation failed')
  })

  it('should queue tasks when a user already has three running tasks', async () => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
      .mockReturnValueOnce('22222222-2222-4222-8222-222222222222')
      .mockReturnValueOnce('33333333-3333-4333-8333-333333333333')
      .mockReturnValueOnce('44444444-4444-4444-8444-444444444444')
    filesMethods.doWork.mockImplementation(() => new Promise(() => undefined))
    const user = { id: 7 } as any

    await filesTasksManager.createTask(FILE_OPERATION.COPY, user, { url: 'files/personal/document-1.txt' } as any, null, 'doWork')
    await filesTasksManager.createTask(FILE_OPERATION.COPY, user, { url: 'files/personal/document-2.txt' } as any, null, 'doWork')
    await filesTasksManager.createTask(FILE_OPERATION.COPY, user, { url: 'files/personal/document-3.txt' } as any, null, 'doWork')
    await filesTasksManager.createTask(FILE_OPERATION.COPY, user, { url: 'files/personal/document-4.txt' } as any, null, 'doWork')

    expect(filesMethods.doWork).toHaveBeenCalledTimes(3)
    expect(cacheStore.get(`${CACHE_TASK_PREFIX}-7-11111111-1111-4111-8111-111111111111`).status).toBe(FileTaskStatus.PENDING)
    expect(cacheStore.get(`${CACHE_TASK_PREFIX}-7-44444444-4444-4444-8444-444444444444`).status).toBe(FileTaskStatus.QUEUED)
    expect(cacheStore.get(`${CACHE_TASK_USER_PREFIX}-7`)).toBe(3)
  })

  it('should start the next queued task when a running task completes', async () => {
    const resolveWork: (() => void)[] = []
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
      .mockReturnValueOnce('22222222-2222-4222-8222-222222222222')
      .mockReturnValueOnce('33333333-3333-4333-8333-333333333333')
      .mockReturnValueOnce('44444444-4444-4444-8444-444444444444')
    filesMethods.doWork.mockImplementation(() => new Promise<void>((resolve) => resolveWork.push(resolve)))
    const user = { id: 7 } as any

    await filesTasksManager.createTask(FILE_OPERATION.COPY, user, { url: 'files/personal/document-1.txt' } as any, null, 'doWork')
    await filesTasksManager.createTask(FILE_OPERATION.COPY, user, { url: 'files/personal/document-2.txt' } as any, null, 'doWork')
    await filesTasksManager.createTask(FILE_OPERATION.COPY, user, { url: 'files/personal/document-3.txt' } as any, null, 'doWork')
    await filesTasksManager.createTask(FILE_OPERATION.COPY, user, { url: 'files/personal/document-4.txt' } as any, null, 'doWork')

    resolveWork[0]()
    await flushPromises()

    expect(filesMethods.doWork).toHaveBeenCalledTimes(4)
    expect(cacheStore.get(`${CACHE_TASK_PREFIX}-7-11111111-1111-4111-8111-111111111111`).status).toBe(FileTaskStatus.SUCCESS)
    expect(cacheStore.get(`${CACHE_TASK_PREFIX}-7-44444444-4444-4444-8444-444444444444`).status).toBe(FileTaskStatus.PENDING)
    expect(cacheStore.get(`${CACHE_TASK_USER_PREFIX}-7`)).toBe(3)
  })

  it('should cancel a queued cancellable task without starting it', async () => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
      .mockReturnValueOnce('22222222-2222-4222-8222-222222222222')
      .mockReturnValueOnce('33333333-3333-4333-8333-333333333333')
      .mockReturnValueOnce('44444444-4444-4444-8444-444444444444')
    filesMethods.doWork.mockImplementation(() => new Promise(() => undefined))
    const user = { id: 7 } as any

    await filesTasksManager.createTask(FILE_OPERATION.DOWNLOAD, user, { url: 'files/personal/document-1.txt' } as any, null, 'doWork')
    await filesTasksManager.createTask(FILE_OPERATION.DOWNLOAD, user, { url: 'files/personal/document-2.txt' } as any, null, 'doWork')
    await filesTasksManager.createTask(FILE_OPERATION.DOWNLOAD, user, { url: 'files/personal/document-3.txt' } as any, null, 'doWork')
    await filesTasksManager.createTask(FILE_OPERATION.DOWNLOAD, user, { url: 'files/personal/document-4.txt' } as any, null, 'doWork')

    await filesTasksManager.cancelTask(7, '44444444-4444-4444-8444-444444444444')

    const storedTask = cacheStore.get(`${CACHE_TASK_PREFIX}-7-44444444-4444-4444-8444-444444444444`)
    expect(filesMethods.doWork).toHaveBeenCalledTimes(3)
    expect(storedTask.status).toBe(FileTaskStatus.CANCELLED)
    expect(storedTask.result).toBe('Cancelled')
  })

  it('should cancel a cached queued cancellable task even when it is not in the local queue', async () => {
    cacheStore.set(`${CACHE_TASK_PREFIX}-8-task-queued`, {
      id: 'task-queued',
      type: FILE_OPERATION.DOWNLOAD,
      status: FileTaskStatus.QUEUED,
      props: {}
    })

    await filesTasksManager.cancelTask(8, 'task-queued')

    const storedTask = cacheStore.get(`${CACHE_TASK_PREFIX}-8-task-queued`)
    expect(storedTask.status).toBe(FileTaskStatus.CANCELLED)
    expect(storedTask.result).toBe('Cancelled')
    expect(storedTask.endedAt).toBeDefined()
    expect(cache.set).not.toHaveBeenCalledWith(`${CACHE_TASK_CANCEL_PREFIX}-8-task-queued`, true, CACHE_TASK_TTL)
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

  it('should ignore tasks that expire between cache key lookup and batch loading', async () => {
    cache.keys.mockResolvedValueOnce([`${CACHE_TASK_PREFIX}-16-task-1`, `${CACHE_TASK_PREFIX}-16-expired`])
    cache.mget.mockResolvedValueOnce([{ id: 'task-1' }, undefined])

    const tasks = await filesTasksManager.getTasks(16)

    expect(tasks).toEqual([{ id: 'task-1' }])
  })

  it('should classify active, ended and missing tracked tasks when polling', async () => {
    cacheStore.set(`${CACHE_TASK_PREFIX}-17-task-pending`, {
      id: 'task-pending',
      status: FileTaskStatus.PENDING
    })
    cacheStore.set(`${CACHE_TASK_PREFIX}-17-task-queued`, {
      id: 'task-queued',
      status: FileTaskStatus.QUEUED
    })
    cacheStore.set(`${CACHE_TASK_PREFIX}-17-task-success`, {
      id: 'task-success',
      status: FileTaskStatus.SUCCESS
    })
    cacheStore.set(`${CACHE_TASK_PREFIX}-17-task-untracked`, {
      id: 'task-untracked',
      status: FileTaskStatus.ERROR
    })

    const result = await filesTasksManager.pollTasks(17, ['task-pending', 'task-success', 'task-missing'])

    expect(result).toEqual({
      active: [
        { id: 'task-pending', status: FileTaskStatus.PENDING },
        { id: 'task-queued', status: FileTaskStatus.QUEUED }
      ],
      ended: [{ id: 'task-success', status: FileTaskStatus.SUCCESS }],
      missingIds: ['task-missing']
    })
  })

  it('should delete completed task, remove archive file and delete cache entry', async () => {
    const removeFilesSpy = vi.spyOn(filesUtils, 'removeFiles').mockResolvedValueOnce(undefined)
    const stopWatchSpy = vi.spyOn(filesTasksManager as any, 'stopWatch').mockResolvedValueOnce(undefined)
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

  it('should ignore active tasks when deleting all tasks', async () => {
    const removeFilesSpy = vi.spyOn(filesUtils, 'removeFiles').mockResolvedValue(undefined)
    const stopWatchSpy = vi.spyOn(filesTasksManager as any, 'stopWatch').mockResolvedValue(undefined)
    const user = { id: 31, tasksPath: '/tmp/tasks' } as any
    cacheStore.set(`${CACHE_TASK_PREFIX}-31-task-pending`, {
      id: 'task-pending',
      status: FileTaskStatus.PENDING,
      props: { compressInDirectory: false }
    })
    cacheStore.set(`${CACHE_TASK_PREFIX}-31-task-queued`, {
      id: 'task-queued',
      status: FileTaskStatus.QUEUED,
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
    vi.spyOn(SendFile.prototype, 'checks').mockRejectedValueOnce({ message: 'Location not found', httpCode: 404 } as any)

    const downloadPromise = filesTasksManager.downloadArchive({ id: 50, tasksPath: '/tmp/tasks' } as any, 'task-ok', {} as any, {} as any)
    await expect(downloadPromise).rejects.toThrow(HttpException)
    await expect(downloadPromise).rejects.toThrow('Location not found')
    await expect(downloadPromise).rejects.toSatisfy((e: HttpException) => {
      return e.getStatus() === 404
    })
  })

  it('should stream archive when task is valid', async () => {
    const streamable = { ok: true } as any
    cacheStore.set(`${CACHE_TASK_PREFIX}-60-task-ok`, {
      id: 'task-ok',
      name: 'archive.tar',
      status: FileTaskStatus.SUCCESS,
      props: { compressInDirectory: false }
    })
    vi.spyOn(SendFile.prototype, 'checks').mockResolvedValueOnce(undefined)
    vi.spyOn(SendFile.prototype, 'stream').mockResolvedValueOnce(streamable)

    const result = await filesTasksManager.downloadArchive({ id: 60, tasksPath: '/tmp/tasks' } as any, 'task-ok', { raw: {} } as any, {} as any)

    expect(result).toBe(streamable)
  })
})
