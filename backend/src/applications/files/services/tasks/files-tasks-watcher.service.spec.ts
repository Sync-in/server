import { Cache } from '../../../../infrastructure/cache/cache.service'
import { CACHE_TASK_TTL } from '../../constants/cache'
import { FileTaskEvent } from '../../events/file-events'
import { FileTaskStatus } from '../../models/file-task'
import * as filesUtils from '../../utils/files'
import * as tasksUtils from '../../utils/tasks'
import { FilesTasksWatcher } from './files-tasks-watcher.service'
import { Mock } from 'vitest'

describe(FilesTasksWatcher.name, () => {
  let service: FilesTasksWatcher
  let cacheStore: Map<string, any>
  let cache: {
    get: Mock
    set: Mock
  }

  const flushPromises = async () => {
    await Promise.resolve()
    await Promise.resolve()
  }

  const makeSpace = (cacheKey = 'task-1', props: Record<string, any> = {}) =>
    ({
      url: 'files/personal/source.txt',
      task: { cacheKey, props }
    }) as any

  beforeEach(() => {
    cacheStore = new Map()
    cache = {
      get: vi.fn(async (key: string) => cacheStore.get(key)),
      set: vi.fn(async (key: string, value: unknown) => {
        cacheStore.set(key, value)
        return true
      })
    }
    service = new FilesTasksWatcher(cache as unknown as Cache)
  })

  afterEach(() => {
    service.onModuleDestroy()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('subscribes to task watch events and unsubscribes on module destroy', () => {
    const listenersBeforeDestroy = FileTaskEvent.listenerCount('startWatch')

    service.onModuleDestroy()

    expect(FileTaskEvent.listenerCount('startWatch')).toBe(listenersBeforeDestroy - 1)
  })

  it('returns file or directory metrics for a watched path', async () => {
    vi.spyOn(filesUtils, 'isPathIsDir').mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    vi.spyOn(filesUtils, 'fileSize').mockResolvedValueOnce(42)
    vi.spyOn(tasksUtils, 'countDirEntriesAndSize').mockResolvedValueOnce({ files: 2, directories: 1, size: 84 })

    await expect(service.getPathProps('/files/report.txt')).resolves.toEqual({ size: 42 })
    await expect(service.getPathProps('/files/archive')).resolves.toEqual({ files: 2, directories: 1, size: 84 })
  })

  it('starts a download watcher with the published task metadata', async () => {
    const space = makeSpace()
    const updateTask = vi.spyOn(service as any, 'updateTask').mockResolvedValue(undefined)
    const watchTask = vi.spyOn(service as any, 'watchTask').mockImplementation((_cacheKey: string, update: () => Promise<void>) => void update())

    FileTaskEvent.emit('startWatch', space, '/files/report.txt')
    await flushPromises()

    expect(updateTask).toHaveBeenCalledWith('task-1', {}, { name: 'report.txt', path: 'files/personal' })
    expect(watchTask).toHaveBeenCalledWith('task-1', expect.any(Function))
    expect(updateTask).toHaveBeenCalledWith('task-1', space.task.props)
  })

  it('does not start duplicate watchers for the same task', () => {
    const space = makeSpace()
    const watchTask = vi.spyOn(service as any, 'watchTask')
    ;(service as any).tasksWatcher['task-1'] = setInterval(() => undefined, 1000)
    ;(service as any).startWatch(space, '/files/report.txt')

    expect(watchTask).not.toHaveBeenCalled()
  })

  it('does not overlap interval updates', async () => {
    vi.useFakeTimers()
    let finishUpdate!: () => void
    const update = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishUpdate = resolve
        })
    )

    ;(service as any).watchTask('task-1', update)
    await vi.advanceTimersByTimeAsync(2000)

    expect(update).toHaveBeenCalledTimes(1)

    finishUpdate()
    await flushPromises()
    await vi.advanceTimersByTimeAsync(1000)

    expect(update).toHaveBeenCalledTimes(2)
  })

  it('merges active task metadata and properties in the cache', async () => {
    cacheStore.set('task-1', {
      name: 'source.txt',
      path: 'files/personal',
      props: { progress: 1, totalSize: 100 },
      status: FileTaskStatus.PENDING
    })

    await (service as any).updateTask('task-1', { progress: 40, size: 40 }, { name: 'destination.txt' })

    expect(cache.set).toHaveBeenCalledWith(
      'task-1',
      {
        name: 'destination.txt',
        path: 'files/personal',
        props: { progress: 40, size: 40, totalSize: 100 },
        status: FileTaskStatus.PENDING
      },
      CACHE_TASK_TTL
    )
  })

  it.each([undefined, FileTaskStatus.SUCCESS])('stops watching when the cached task is missing or inactive', async (status) => {
    if (status !== undefined) {
      cacheStore.set('task-1', { props: {}, status })
    }
    const stopWatch = vi.spyOn(service, 'stopWatch')

    await (service as any).updateTask('task-1', { size: 10 })

    expect(stopWatch).toHaveBeenCalledWith('task-1')
    expect(cache.set).not.toHaveBeenCalled()
  })

  it('waits for pending updates and prevents cache writes during finalization', async () => {
    let resolveGet!: (value: unknown) => void
    cache.get.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveGet = resolve
      })
    )
    const update = (service as any).updateTask('task-1', { size: 10 })
    await flushPromises()

    const finalization = service.beginFinalization('task-1')
    resolveGet({ props: {}, status: FileTaskStatus.PENDING })
    await Promise.all([update, finalization])

    expect(cache.set).not.toHaveBeenCalled()
    expect((service as any).finalizingTasks.has('task-1')).toBe(true)

    service.endFinalization('task-1')
    expect((service as any).finalizingTasks.has('task-1')).toBe(false)
  })
})
