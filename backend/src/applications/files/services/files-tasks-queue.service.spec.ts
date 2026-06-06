import { Mock } from 'vitest'
import { Cache } from '../../../infrastructure/cache/cache.service'
import { CACHE_TASK_TTL, CACHE_TASK_USER_PREFIX } from '../constants/cache'
import type { FileTaskQueueItem, FileTaskQueueStarter } from '../interfaces/file-task-queue.interface'
import { FilesTasksQueue } from './files-tasks-queue.service'

describe(FilesTasksQueue.name, () => {
  const userId = 42
  const counterKey = `${CACHE_TASK_USER_PREFIX}-${userId}`
  let counters: Map<string, number>
  let increment: Mock
  let queue: FilesTasksQueue

  const createTask = (id: string): FileTaskQueueItem =>
    ({
      cacheKey: `ftask-${userId}-${id}`,
      task: { id }
    }) as FileTaskQueueItem

  beforeEach(() => {
    counters = new Map<string, number>()
    increment = vi.fn(async (key: string, amount = 1, _ttl?: number, minimum?: number) => {
      const value = Math.max((counters.get(key) ?? 0) + amount, minimum ?? Number.NEGATIVE_INFINITY)
      counters.set(key, value)
      return value
    })
    queue = new FilesTasksQueue({ increment } as unknown as Cache)
  })

  afterEach(() => {
    queue.stop()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('should build the shared running tasks cache key', () => {
    expect(FilesTasksQueue.getUserRunningTasksCacheKey(userId)).toBe(counterKey)
  })

  it('should start at most three tasks per user and queue the next one', async () => {
    const startTask = vi.fn<FileTaskQueueStarter>().mockResolvedValue(true)
    const tasks = ['task-1', 'task-2', 'task-3', 'task-4'].map(createTask)

    for (const task of tasks) {
      await queue.enqueue(userId, task, startTask)
    }

    expect(startTask).toHaveBeenCalledTimes(3)
    expect(startTask.mock.calls.map(([task]) => task.task.id)).toEqual(['task-1', 'task-2', 'task-3'])
    expect(counters.get(counterKey)).toBe(3)
  })

  it('should apply the running task limit independently for each user', async () => {
    const secondUserId = 84
    const startTask = vi.fn<FileTaskQueueStarter>().mockResolvedValue(true)

    for (const currentUserId of [userId, secondUserId]) {
      for (const id of ['task-1', 'task-2', 'task-3']) {
        await queue.enqueue(currentUserId, createTask(`${currentUserId}-${id}`), startTask)
      }
    }

    expect(startTask).toHaveBeenCalledTimes(6)
    expect(counters.get(counterKey)).toBe(3)
    expect(counters.get(`${CACHE_TASK_USER_PREFIX}-${secondUserId}`)).toBe(3)
  })

  it('should start the next queued task after releasing a slot', async () => {
    const startTask = vi.fn<FileTaskQueueStarter>().mockResolvedValue(true)

    for (const id of ['task-1', 'task-2', 'task-3', 'task-4']) {
      await queue.enqueue(userId, createTask(id), startTask)
    }
    await queue.releaseAndDrain(userId)

    expect(startTask).toHaveBeenCalledTimes(4)
    expect(startTask).toHaveBeenLastCalledWith(expect.objectContaining({ task: expect.objectContaining({ id: 'task-4' }) }))
    expect(counters.get(counterKey)).toBe(3)
  })

  it('should remove a queued task without starting it', async () => {
    const startTask = vi.fn<FileTaskQueueStarter>().mockResolvedValue(true)

    for (const id of ['task-1', 'task-2', 'task-3', 'task-4']) {
      await queue.enqueue(userId, createTask(id), startTask)
    }
    queue.remove(userId, 'task-4')
    await queue.releaseAndDrain(userId)

    expect(startTask).toHaveBeenCalledTimes(3)
    expect(counters.get(counterKey)).toBe(2)
  })

  it('should release the claimed slot when a task cannot start', async () => {
    const startTask = vi.fn<FileTaskQueueStarter>().mockResolvedValue(false)

    await queue.enqueue(userId, createTask('task-1'), startTask)

    expect(startTask).toHaveBeenCalledOnce()
    expect(counters.get(counterKey)).toBe(0)
    expect(increment).toHaveBeenLastCalledWith(counterKey, -1, CACHE_TASK_TTL, 0)
  })

  it('should release the claimed slot when the task starter throws', async () => {
    const error = new Error('start failed')
    const startTask = vi.fn<FileTaskQueueStarter>().mockRejectedValue(error)
    const loggerSpy = vi.spyOn((queue as any).logger, 'error').mockImplementation(() => undefined)

    await queue.enqueue(userId, createTask('task-1'), startTask)

    expect(loggerSpy).toHaveBeenCalledWith({ tag: 'drain', msg: `${error}` })
    expect(counters.get(counterKey)).toBe(0)
  })

  it('should never decrement the shared counter below zero', async () => {
    await queue.releaseAndDrain(userId)
    await queue.releaseAndDrain(userId)

    expect(counters.get(counterKey)).toBe(0)
    expect(increment).toHaveBeenLastCalledWith(counterKey, -1, CACHE_TASK_TTL, 0)
  })

  it('should periodically retry queued tasks when a shared slot becomes available', async () => {
    vi.useFakeTimers()
    counters.set(counterKey, 3)
    const startTask = vi.fn<FileTaskQueueStarter>().mockResolvedValue(true)

    await queue.enqueue(userId, createTask('task-1'), startTask)
    expect(startTask).not.toHaveBeenCalled()

    counters.set(counterKey, 2)
    await vi.advanceTimersByTimeAsync(1000)

    expect(startTask).toHaveBeenCalledOnce()
    expect(counters.get(counterKey)).toBe(3)
  })
})
