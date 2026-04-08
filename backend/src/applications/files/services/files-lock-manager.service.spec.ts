import { Test, TestingModule } from '@nestjs/testing'
import crypto from 'node:crypto'
import { currentTimeStamp } from '../../../common/shared'
import { Cache } from '../../../infrastructure/cache/services/cache.service'
import { CACHE_LOCK_PREFIX } from '../constants/cache'
import { LockConflict } from '../models/file-lock-error'
import { DEPTH, LOCK_PREFIX, LOCK_SCOPE, WEBDAV_APP_LOCK } from '../../webdav/constants/webdav'
import { FilesLockManager } from './files-lock-manager.service'

describe(FilesLockManager.name, () => {
  let filesLockManager: FilesLockManager
  let cacheStore: Map<string, any>
  let cache: {
    set: jest.Mock
    get: jest.Mock
    mget: jest.Mock
    del: jest.Mock
    keys: jest.Mock
  }

  const createPatternRegex = (pattern: string): RegExp => {
    const escapedPattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
    return new RegExp(`^${escapedPattern}$`)
  }

  const generatorFrom = <T>(items: T[]) =>
    (async function* () {
      for (const item of items) {
        yield item
      }
    })()

  beforeEach(async () => {
    cacheStore = new Map<string, any>()
    cache = {
      set: jest.fn(async (key: string, value: unknown) => {
        cacheStore.set(key, value)
        return true
      }),
      get: jest.fn(async (key: string) => cacheStore.get(key)),
      mget: jest.fn(async (keys: string[]) => keys.map((k) => cacheStore.get(k))),
      del: jest.fn(async (key: string) => cacheStore.delete(key)),
      keys: jest.fn(async (pattern: string) => [...cacheStore.keys()].filter((k) => createPatternRegex(pattern).test(k)))
    }
    const module: TestingModule = await Test.createTestingModule({
      providers: [FilesLockManager, { provide: Cache, useValue: cache }]
    }).compile()

    module.useLogger(['fatal'])
    filesLockManager = module.get<FilesLockManager>(FilesLockManager)
  })

  afterEach(() => {
    jest.restoreAllMocks()
    jest.clearAllMocks()
  })

  it('should be defined', () => {
    expect(filesLockManager).toBeDefined()
  })

  it('should remove lock by key using cache', async () => {
    cacheStore.set('flock|key-1', { key: 'flock|key-1' })

    const removed = await filesLockManager.removeLock('flock|key-1')

    expect(removed).toBe(true)
    expect(cache.del).toHaveBeenCalledWith('flock|key-1')
  })

  it('should create and cache a lock when there is no conflict', async () => {
    const user = {
      id: 10,
      asOwner: () => ({ id: 10, login: 'john', email: 'john@sync-in.com', fullName: 'John' })
    } as any
    const dbFile = { path: 'docs/file.txt', ownerId: 10, inTrash: false } as any
    const conflictSpy = jest.spyOn(filesLockManager, 'checkConflicts').mockResolvedValueOnce(undefined)

    const [created, lock] = await filesLockManager.create(
      user,
      dbFile,
      WEBDAV_APP_LOCK,
      DEPTH.RESOURCE,
      { lockRoot: '/webdav/docs/file.txt', lockToken: 'opaquelocktoken:t1', lockScope: LOCK_SCOPE.EXCLUSIVE },
      100
    )

    expect(conflictSpy).toHaveBeenCalledWith(dbFile, DEPTH.RESOURCE, { app: WEBDAV_APP_LOCK, lockScope: LOCK_SCOPE.EXCLUSIVE })
    expect(created).toBe(true)
    expect(lock.key).toContain(`${CACHE_LOCK_PREFIX}|token:opaquelocktoken:t1|depth:0|path:docs/file.txt|ownerId:10`)
    expect(cache.set).toHaveBeenCalledWith(lock.key, lock, 100)
    expect(lock.expiration).toBeGreaterThan(currentTimeStamp())
  })

  it('should return existing conflict lock on create', async () => {
    const conflictLock = {
      owner: { id: 99, login: 'other', email: 'other@sync-in.com', fullName: 'Other' },
      dbFilePath: 'docs/file.txt',
      key: 'flock|x'
    } as any
    jest.spyOn(filesLockManager, 'checkConflicts').mockRejectedValueOnce(new LockConflict(conflictLock, 'conflict'))

    const [created, lock] = await filesLockManager.create(
      { id: 10, asOwner: () => ({ id: 10, login: 'john', email: '', fullName: '' }) } as any,
      { path: 'docs/file.txt', ownerId: 10, inTrash: false } as any,
      WEBDAV_APP_LOCK,
      DEPTH.INFINITY
    )

    expect(created).toBe(false)
    expect(lock).toBe(conflictLock)
    expect(cache.set).not.toHaveBeenCalled()
  })

  it('should refresh owned lock when createOrRefresh finds a stale lock', async () => {
    const lock = {
      key: 'flock|k1',
      owner: { id: 10, login: 'john' },
      expiration: currentTimeStamp() + 100
    } as any
    jest.spyOn(filesLockManager, 'getLocksByPath').mockResolvedValueOnce([lock])
    const refreshSpy = jest.spyOn(filesLockManager, 'refreshLockTimeout').mockResolvedValueOnce(undefined)

    const [created, result] = await filesLockManager.createOrRefresh(
      { id: 10 } as any,
      { path: 'docs/file.txt', ownerId: 10, inTrash: false } as any,
      WEBDAV_APP_LOCK,
      DEPTH.RESOURCE,
      300
    )

    expect(created).toBe(false)
    expect(result).toBe(lock)
    expect(refreshSpy).toHaveBeenCalledWith(lock, 300)
  })

  it('should throw conflict in createOrRefresh when lock is owned by another user', async () => {
    const lock = { key: 'flock|k2', owner: { id: 42, login: 'alice' } } as any
    jest.spyOn(filesLockManager, 'getLocksByPath').mockResolvedValueOnce([lock])

    await expect(
      filesLockManager.createOrRefresh(
        { id: 10 } as any,
        { path: 'docs/file.txt', ownerId: 10, inTrash: false } as any,
        WEBDAV_APP_LOCK,
        DEPTH.RESOURCE
      )
    ).rejects.toEqual(new LockConflict(lock, 'Conflicting lock'))
  })

  it('should create a new lock in createOrRefresh when no lock exists', async () => {
    const lock = { key: 'flock|k3', owner: { id: 10 } } as any
    jest.spyOn(filesLockManager, 'getLocksByPath').mockResolvedValueOnce([])
    const createSpy = jest.spyOn(filesLockManager, 'create').mockResolvedValueOnce([true, lock])

    const [created, result] = await filesLockManager.createOrRefresh(
      { id: 10 } as any,
      { path: 'docs/file.txt', ownerId: 10, inTrash: false } as any,
      WEBDAV_APP_LOCK,
      DEPTH.RESOURCE,
      55
    )

    expect(createSpy).toHaveBeenCalledWith(
      { id: 10 },
      { path: 'docs/file.txt', ownerId: 10, inTrash: false },
      WEBDAV_APP_LOCK,
      DEPTH.RESOURCE,
      null,
      55
    )
    expect(created).toBe(true)
    expect(result).toBe(lock)
  })

  it('should return locks by file path', async () => {
    const key = `${CACHE_LOCK_PREFIX}|depth:0|path:docs/file.txt|ownerId:10`
    cacheStore.set(key, { key, dbFilePath: 'docs/file.txt', owner: { login: 'john' } })

    const locks = await filesLockManager.getLocksByPath({ path: 'docs/file.txt', ownerId: 10, inTrash: false } as any)

    expect(locks).toHaveLength(1)
    expect(locks[0].dbFilePath).toBe('docs/file.txt')
  })

  it('should browse locks and return keyed object by file name', async () => {
    jest.spyOn(filesLockManager, 'getLocksByPath').mockResolvedValueOnce([
      { dbFilePath: 'docs/a.txt', owner: { login: 'john' } },
      { dbFilePath: 'docs/b.txt', owner: { login: 'alice' } }
    ] as any)

    const locks = await filesLockManager.browseLocks({ path: 'docs', ownerId: 10, inTrash: false } as any)

    expect(locks).toEqual({
      'a.txt': expect.objectContaining({ dbFilePath: 'docs/a.txt' }),
      'b.txt': expect.objectContaining({ dbFilePath: 'docs/b.txt' })
    })
  })

  it('should return false for isPathLocked when path is not root path', async () => {
    const spy = jest.spyOn(filesLockManager as any, 'searchKeysByPath')

    const isLocked = await filesLockManager.isPathLocked({ path: 'docs/file.txt', ownerId: 1, inTrash: false } as any)

    expect(isLocked).toBe(false)
    expect(spy).not.toHaveBeenCalled()
  })

  it('should return true for isPathLocked when root path has lock keys', async () => {
    const spy = jest.spyOn(filesLockManager as any, 'searchKeysByPath').mockResolvedValueOnce(['flock|root-key'])

    const isLocked = await filesLockManager.isPathLocked({ path: '.', ownerId: 1, inTrash: false } as any)

    expect(isLocked).toBe(true)
    expect(spy).toHaveBeenCalled()
  })

  it('should resolve lock by token and match path ancestry', async () => {
    const key = `${CACHE_LOCK_PREFIX}|token:opaquelocktoken:t1|depth:infinity|path:docs|ownerId:1`
    const lock = { key, dbFilePath: 'docs', owner: { id: 1, login: 'john' } }
    cacheStore.set(key, lock)

    await expect(filesLockManager.getLockByToken('opaquelocktoken:t1')).resolves.toBe(lock)
    await expect(filesLockManager.isLockedWithToken('opaquelocktoken:t1', 'docs/sub/file.txt')).resolves.toBe(lock)
    await expect(filesLockManager.isLockedWithToken('opaquelocktoken:t1', 'other/path')).resolves.toBeNull()
  })

  it('should browse parent and child locks and keep first shared duplicate name', async () => {
    jest.spyOn(filesLockManager, 'browseLocks').mockResolvedValueOnce({
      root: { dbFilePath: 'docs/root' } as any
    })
    jest
      .spyOn(filesLockManager as any, 'searchChildLocks')
      .mockReturnValue(
        generatorFrom([
          { dbFilePath: 'docs/a.txt', owner: { login: 'a' } } as any,
          { dbFilePath: 'docs/a.txt', owner: { login: 'b' } } as any,
          { dbFilePath: 'docs/sub/b.txt', owner: { login: 'c' } } as any
        ])
      )

    const locks = await filesLockManager.browseParentChildLocks({ path: 'docs', ownerId: 1, inTrash: false } as any)

    expect(locks.root).toBeDefined()
    expect(locks['a.txt']).toEqual(expect.objectContaining({ dbFilePath: 'docs/a.txt', owner: { login: 'a' } }))
    expect(locks['b.txt']).toBeUndefined()
  })

  it('should remove owned child locks and throw on conflicting owner lock', async () => {
    const removeSpy = jest.spyOn(filesLockManager, 'removeLock').mockResolvedValue(true)

    jest
      .spyOn(filesLockManager as any, 'searchChildLocks')
      .mockReturnValueOnce(
        generatorFrom([
          { key: 'k1', owner: { id: 7, login: 'john' }, dbFilePath: 'docs/a.txt' } as any,
          { key: 'k2', owner: { id: 7, login: 'john' }, dbFilePath: 'docs/b.txt' } as any
        ])
      )
    await filesLockManager.removeChildLocks({ id: 7, login: 'john' } as any, { path: 'docs', ownerId: 7, inTrash: false } as any)
    expect(removeSpy).toHaveBeenCalledWith('k1')
    expect(removeSpy).toHaveBeenCalledWith('k2')

    jest
      .spyOn(filesLockManager as any, 'searchChildLocks')
      .mockReturnValueOnce(generatorFrom([{ key: 'k3', owner: { id: 9, login: 'alice' }, dbFilePath: 'docs/c.txt' } as any]))
    await expect(
      filesLockManager.removeChildLocks({ id: 7, login: 'john' } as any, { path: 'docs', ownerId: 7, inTrash: false } as any)
    ).rejects.toBeInstanceOf(LockConflict)
  })

  it('should accept shared same-app conflicts and owner token matches in checkConflicts', async () => {
    jest.spyOn(filesLockManager as any, 'searchParentLocks').mockReturnValue(
      generatorFrom([
        {
          owner: { id: 2, login: 'alice' },
          app: WEBDAV_APP_LOCK,
          options: { lockScope: LOCK_SCOPE.SHARED }
        } as any
      ])
    )
    jest.spyOn(filesLockManager as any, 'searchChildLocks').mockReturnValue(
      generatorFrom([
        {
          owner: { id: 7, login: 'john' },
          app: WEBDAV_APP_LOCK,
          options: { lockToken: 'opaquelocktoken:t1' }
        } as any
      ])
    )

    await expect(
      filesLockManager.checkConflicts({ path: 'docs/file.txt', ownerId: 7, inTrash: false } as any, DEPTH.INFINITY, {
        userId: 7,
        app: WEBDAV_APP_LOCK,
        lockScope: LOCK_SCOPE.SHARED,
        lockTokens: ['opaquelocktoken:t1']
      })
    ).resolves.toBeUndefined()
  })

  it('should throw on parent conflict in checkConflicts', async () => {
    const parentLock = {
      owner: { id: 99, login: 'other' },
      dbFilePath: 'docs',
      app: WEBDAV_APP_LOCK,
      options: { lockScope: LOCK_SCOPE.EXCLUSIVE }
    } as any
    jest.spyOn(filesLockManager as any, 'searchParentLocks').mockReturnValue(generatorFrom([parentLock]))
    jest.spyOn(filesLockManager as any, 'searchChildLocks').mockReturnValue(generatorFrom([]))

    await expect(
      filesLockManager.checkConflicts({ path: 'docs/file.txt', ownerId: 7, inTrash: false } as any, DEPTH.RESOURCE, {
        userId: 7,
        app: WEBDAV_APP_LOCK
      })
    ).rejects.toEqual(new LockConflict(parentLock, 'conflicting parent lock : docs/file.txt -> docs (other)'))
  })

  it('should convert lock to file lock props and generate a DAV token', () => {
    jest.spyOn(crypto, 'randomUUID').mockReturnValueOnce('33333333-3333-4333-8333-333333333333')
    const lock = {
      owner: { id: 2, login: 'alice' },
      app: WEBDAV_APP_LOCK,
      options: { lockInfo: 'office', lockScope: LOCK_SCOPE.SHARED }
    } as any

    const props = filesLockManager.convertLockToFileLockProps(lock)
    const token = filesLockManager.genDAVToken()

    expect(props).toEqual({ owner: { id: 2, login: 'alice' }, app: WEBDAV_APP_LOCK, info: 'office', isExclusive: false })
    expect(token).toBe(`${LOCK_PREFIX}33333333-3333-4333-8333-333333333333`)
  })

  it('should refresh lock timeout and persist updated expiration', async () => {
    const lock = {
      key: 'flock|refresh',
      expiration: currentTimeStamp() + 1
    } as any

    await filesLockManager.refreshLockTimeout(lock, 120)

    expect(lock.expiration).toBeGreaterThan(currentTimeStamp())
    expect(cache.set).toHaveBeenCalledWith('flock|refresh', lock, 120)
  })
})
