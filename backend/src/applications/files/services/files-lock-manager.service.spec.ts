import { Test, TestingModule } from '@nestjs/testing'
import { currentTimeStamp } from '../../../common/shared.js'
import { Cache } from '../../../infrastructure/cache/cache.service.js'
import type { CacheCompareAndSwapCommand } from '../../../infrastructure/cache/interfaces/cache-compare-and-swap.interface.js'
import { DEPTH, LOCK_SCOPE, WEBDAV_APP_LOCK } from '../../webdav/constants/webdav.js'
import { CACHE_LOCK_NATIVE_SCOPE_SEGMENT, CACHE_LOCK_PREFIX, CACHE_LOCK_STATE_MAX_LOCKS } from '../constants/cache.js'
import type { FileDBProps } from '../interfaces/file-db-props.interface.js'
import type { FileLock, FileLockState } from '../interfaces/file-lock.interface.js'
import { LockConflict } from '../models/file-lock-error.js'
import { FilesLockManager } from './files-lock-manager.service.js'
import type { Mock } from 'vitest'

describe(FilesLockManager.name, () => {
  let filesLockManager: FilesLockManager
  let cacheStore: Map<string, FileLockState>
  let cache: {
    get: Mock
    keys: Mock
    mget: Mock
    compareAndSwap: Mock
  }

  const dbFile = { path: 'docs/file.txt', ownerId: 10, inTrash: false } as FileDBProps
  const user = {
    id: 10,
    login: 'john',
    asOwner: () => ({ id: 10, login: 'john', email: 'john@sync-in.com', fullName: 'John' })
  } as any
  const stateKey = `${CACHE_LOCK_PREFIX}|ownerId:10|${CACHE_LOCK_NATIVE_SCOPE_SEGMENT}|path:${dbFile.path}`

  const createPatternRegex = (pattern: string): RegExp => {
    const escapedPattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
    return new RegExp(`^${escapedPattern}$`)
  }

  const makeLock = (overrides: Partial<FileLock> = {}): FileLock => ({
    lockId: 'lock-id-1',
    owner: user.asOwner(),
    dbFilePath: dbFile.path,
    key: `${stateKey}|depth:0`,
    app: WEBDAV_APP_LOCK,
    depth: DEPTH.RESOURCE,
    expiration: currentTimeStamp() + 300,
    ...overrides
  })

  const setState = (key: string, locks: FileLock[], version = 'version-1'): FileLockState => {
    const state = { version, locks }
    cacheStore.set(key, state)
    return state
  }

  const compareAndSwap = async (command: CacheCompareAndSwapCommand): Promise<boolean> => {
    const current = cacheStore.get(command.key)
    if ((current?.version ?? null) !== command.expectedVersion) return false
    if (command.value === undefined) cacheStore.delete(command.key)
    else cacheStore.set(command.key, command.value as FileLockState)
    return true
  }

  beforeEach(async () => {
    cacheStore = new Map<string, FileLockState>()
    cache = {
      get: vi.fn(async (key: string) => cacheStore.get(key)),
      keys: vi.fn(async (pattern: string) => [...cacheStore.keys()].filter((key) => createPatternRegex(pattern).test(key))),
      mget: vi.fn(async (keys: string[]) => keys.map((key) => cacheStore.get(key))),
      compareAndSwap: vi.fn(compareAndSwap)
    }
    const module: TestingModule = await Test.createTestingModule({
      providers: [FilesLockManager, { provide: Cache, useValue: cache }]
    }).compile()

    module.useLogger(['fatal'])
    filesLockManager = module.get<FilesLockManager>(FilesLockManager)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('should be defined', () => {
    expect(filesLockManager).toBeDefined()
  })

  it('should atomically create one exact-resource state', async () => {
    const [created, lock] = await filesLockManager.create(
      user,
      dbFile,
      WEBDAV_APP_LOCK,
      DEPTH.RESOURCE,
      { lockRoot: '/webdav/docs/file.txt', lockToken: 'opaquelocktoken:t1', lockScope: LOCK_SCOPE.EXCLUSIVE },
      100
    )

    expect(created).toBe(true)
    expect(lock.lockId).toEqual(expect.any(String))
    expect(lock.key).toBe(`${stateKey}|depth:0|token:opaquelocktoken:t1`)
    expect(cacheStore.get(stateKey)).toEqual({ version: expect.any(String), locks: [lock] })
    expect(cache.compareAndSwap).toHaveBeenCalledWith({
      key: stateKey,
      expectedVersion: null,
      value: { version: expect.any(String), locks: [lock] },
      ttl: expect.any(Number)
    })
    expect(cache.compareAndSwap.mock.calls[0][0].ttl).toBeGreaterThanOrEqual(100)
    expect(cache.get).not.toHaveBeenCalled()
  })

  it('should isolate exact states by storage scope and path', async () => {
    const baseFile = { path: 'same/file.txt', spaceId: 1, inTrash: false } as FileDBProps
    const externalFile = { path: 'same/file.txt', spaceId: 1, spaceExternalRootId: 2, inTrash: false } as FileDBProps
    const externalStateKey = `${CACHE_LOCK_PREFIX}|spaceId:1|spaceExternalRootId:2|path:same/file.txt`
    const baseStateKey = `${CACHE_LOCK_PREFIX}|spaceId:1|${CACHE_LOCK_NATIVE_SCOPE_SEGMENT}|path:same/file.txt`

    await filesLockManager.create(user, externalFile, WEBDAV_APP_LOCK, DEPTH.RESOURCE)
    await filesLockManager.create(user, baseFile, WEBDAV_APP_LOCK, DEPTH.RESOURCE)

    expect(cacheStore.has(externalStateKey)).toBe(true)
    expect(cacheStore.has(baseStateKey)).toBe(true)
    expect(cache.compareAndSwap.mock.calls.map(([command]) => command.key)).toEqual([externalStateKey, baseStateKey])
  })

  it('should compare the complete lock resource identity', () => {
    expect(filesLockManager.isSameLockResource(dbFile, { ...dbFile, path: 'DOCS/FILE.TXT', inTrash: true })).toBe(true)
    expect(filesLockManager.isSameLockResource(dbFile, { ...dbFile, ownerId: 11 })).toBe(false)
    expect(filesLockManager.isSameLockResource(dbFile, { ...dbFile, spaceExternalRootId: 2 })).toBe(false)
  })

  it('should coordinate ASCII case and canonical Unicode path variants in one state', async () => {
    const firstFile = { ...dbFile, path: 'Docs/Caf\u00e9.txt' }
    const equivalentFile = { ...dbFile, path: 'docs/cafe\u0301.txt' }
    const distinctFile = { ...dbFile, path: 'docs/cafe.txt' }
    const canonicalStateKey = `${CACHE_LOCK_PREFIX}|ownerId:10|${CACHE_LOCK_NATIVE_SCOPE_SEGMENT}|path:docs/caf\u00e9.txt`
    const distinctStateKey = `${CACHE_LOCK_PREFIX}|ownerId:10|${CACHE_LOCK_NATIVE_SCOPE_SEGMENT}|path:docs/cafe.txt`

    const [created, lock] = await filesLockManager.create(user, firstFile, WEBDAV_APP_LOCK, DEPTH.RESOURCE)

    expect(created).toBe(true)
    await expect(filesLockManager.create(user, equivalentFile, WEBDAV_APP_LOCK, DEPTH.RESOURCE)).resolves.toEqual([false, lock])
    await expect(filesLockManager.browseLocks(equivalentFile)).resolves.toEqual([lock])
    await expect(filesLockManager.create(user, distinctFile, WEBDAV_APP_LOCK, DEPTH.RESOURCE)).resolves.toEqual([true, expect.any(Object)])
    expect(cacheStore.has(canonicalStateKey)).toBe(true)
    expect(cacheStore.has(distinctStateKey)).toBe(true)
    expect(cacheStore.size).toBe(2)
  })

  it('should coordinate Unicode-caseless path variants in one state', async () => {
    const firstFile = { ...dbFile, path: 'docs/οσ.txt' }
    const equivalentFile = { ...dbFile, path: 'docs/ος.txt' }
    const canonicalStateKey = `${CACHE_LOCK_PREFIX}|ownerId:10|${CACHE_LOCK_NATIVE_SCOPE_SEGMENT}|path:docs/οσ.txt`

    const [created, lock] = await filesLockManager.create(user, firstFile, WEBDAV_APP_LOCK, DEPTH.RESOURCE)

    expect(created).toBe(true)
    await expect(filesLockManager.create(user, equivalentFile, WEBDAV_APP_LOCK, DEPTH.RESOURCE)).resolves.toEqual([false, lock])
    await expect(filesLockManager.browseLocks(equivalentFile)).resolves.toEqual([lock])
    expect(cacheStore.has(canonicalStateKey)).toBe(true)
    expect(cacheStore.size).toBe(1)
  })

  it('should refresh and remove a lock through an equivalent path identity', async () => {
    const firstFile = { ...dbFile, path: 'Docs/Caf\u00e9.txt' }
    const equivalentFile = { ...dbFile, path: 'docs/cafe\u0301.txt' }
    const canonicalStateKey = `${CACHE_LOCK_PREFIX}|ownerId:10|${CACHE_LOCK_NATIVE_SCOPE_SEGMENT}|path:docs/caf\u00e9.txt`
    const [, lock] = await filesLockManager.create(user, firstFile, WEBDAV_APP_LOCK, DEPTH.RESOURCE)

    await expect(filesLockManager.refreshLockTimeout(equivalentFile, lock, 120)).resolves.toBe(true)
    await expect(filesLockManager.removeLock(equivalentFile, lock)).resolves.toBe(true)
    expect(cacheStore.has(canonicalStateKey)).toBe(false)
  })

  it('should preserve the existing active and trash lock namespace', async () => {
    const lock = makeLock()
    setState(stateKey, [lock])

    await expect(filesLockManager.getLocksByPath({ ...dbFile, inTrash: true })).resolves.toEqual([lock])
    expect(cache.get).toHaveBeenCalledWith(stateKey)
  })

  it('should return an exact conflict without writing the state', async () => {
    const conflictLock = makeLock({ owner: { ...user.asOwner(), id: 99, login: 'other' } })
    setState(stateKey, [conflictLock])

    await expect(filesLockManager.create(user, dbFile, WEBDAV_APP_LOCK, DEPTH.RESOURCE)).resolves.toEqual([false, conflictLock])
    expect(cache.compareAndSwap).toHaveBeenCalledOnce()
    expect(cache.compareAndSwap).toHaveBeenCalledWith(expect.objectContaining({ key: stateKey, expectedVersion: null }))
  })

  it('should retry a stale compare-and-swap from a fresh state', async () => {
    cache.compareAndSwap.mockResolvedValueOnce(false).mockImplementation(compareAndSwap)

    const [created, lock] = await filesLockManager.create(user, dbFile, WEBDAV_APP_LOCK, DEPTH.RESOURCE, null, 60)

    expect(created).toBe(true)
    expect(cache.compareAndSwap).toHaveBeenCalledTimes(2)
    expect(cacheStore.get(stateKey)?.locks).toEqual([lock])
  })

  it('should keep compatible shared locks with distinct tokens as independent members', async () => {
    const firstOptions = { lockRoot: '/webdav/docs/file.txt', lockToken: 'token-1', lockScope: LOCK_SCOPE.SHARED }
    const secondOptions = { lockRoot: '/webdav/docs/file.txt', lockToken: 'token-2', lockScope: LOCK_SCOPE.SHARED }
    const [, first] = await filesLockManager.create(user, dbFile, WEBDAV_APP_LOCK, DEPTH.RESOURCE, firstOptions, 30)
    const [, second] = await filesLockManager.create(user, dbFile, WEBDAV_APP_LOCK, DEPTH.RESOURCE, secondOptions, 120)

    expect(cacheStore.get(stateKey)?.locks).toEqual([first, second])
    expect(cache.compareAndSwap.mock.calls.at(-1)?.[0].ttl).toBeGreaterThanOrEqual(120)

    const [, refreshed] = await filesLockManager.create(user, dbFile, WEBDAV_APP_LOCK, DEPTH.RESOURCE, firstOptions, 60)
    const locks = cacheStore.get(stateKey)?.locks ?? []
    expect(refreshed.lockId).not.toBe(first.lockId)
    expect(locks.find((lock) => lock.key === second.key)?.lockId).toBe(second.lockId)
  })

  it('should reuse a tokenless shared lock instead of creating an independent member', async () => {
    const otherUser = {
      id: 11,
      login: 'alice',
      asOwner: () => ({ id: 11, login: 'alice', email: 'alice@sync-in.com', fullName: 'Alice' })
    } as any
    const options = { lockRoot: null, lockToken: null, lockScope: LOCK_SCOPE.SHARED }
    const [, first] = await filesLockManager.create(user, dbFile, WEBDAV_APP_LOCK, DEPTH.RESOURCE, options, 30)

    const [succeeded, reused] = await filesLockManager.create(otherUser, dbFile, WEBDAV_APP_LOCK, DEPTH.RESOURCE, options, 120)

    expect(succeeded).toBe(true)
    expect(reused.lockId).not.toBe(first.lockId)
    expect(reused.owner).toEqual(user.asOwner())
    expect(cacheStore.get(stateKey)?.locks).toEqual([reused])
  })

  it('should bound the number of logical locks stored in one state', async () => {
    const locks = Array.from({ length: CACHE_LOCK_STATE_MAX_LOCKS }, (_, index) =>
      makeLock({
        lockId: `lock-id-${index}`,
        key: `${stateKey}|depth:0|token:${index}`,
        options: { lockRoot: '/webdav/docs/file.txt', lockToken: `token-${index}`, lockScope: LOCK_SCOPE.SHARED }
      })
    )
    setState(stateKey, locks)

    await expect(
      filesLockManager.create(user, dbFile, WEBDAV_APP_LOCK, DEPTH.RESOURCE, {
        lockRoot: '/webdav/docs/file.txt',
        lockToken: 'token-overflow',
        lockScope: LOCK_SCOPE.SHARED
      })
    ).rejects.toThrow(`Cannot store more than ${CACHE_LOCK_STATE_MAX_LOCKS} locks for ${dbFile.path}`)
    expect(cache.compareAndSwap).toHaveBeenCalledOnce()
    expect(cache.compareAndSwap).toHaveBeenCalledWith(expect.objectContaining({ key: stateKey, expectedVersion: null }))
  })

  it('should preserve createOrRefresh reuse and fence every refreshed member', async () => {
    const first = makeLock({ expiration: currentTimeStamp() + 10 })
    const second = makeLock({ lockId: 'lock-id-2', key: `${stateKey}|depth:0|token:t2`, expiration: currentTimeStamp() + 10 })
    const staleFirst = { ...first }
    setState(stateKey, [first, second])

    const [created, refreshed] = await filesLockManager.createOrRefresh(user, dbFile, WEBDAV_APP_LOCK, DEPTH.RESOURCE, 300)

    expect(created).toBe(false)
    expect(refreshed.lockId).not.toBe(first.lockId)
    expect(cacheStore.get(stateKey)?.locks.every((lock) => ![first.lockId, second.lockId].includes(lock.lockId))).toBe(true)
    await expect(filesLockManager.removeLock(dbFile, staleFirst)).resolves.toBe(false)
  })

  it('should reject createOrRefresh when another owner holds the exact resource', async () => {
    const conflictLock = makeLock({ owner: { ...user.asOwner(), id: 42, login: 'alice' } })
    setState(stateKey, [conflictLock])

    await expect(filesLockManager.createOrRefresh(user, dbFile, WEBDAV_APP_LOCK, DEPTH.RESOURCE)).rejects.toEqual(
      new LockConflict(conflictLock, 'Conflicting lock')
    )
    expect(cache.compareAndSwap).not.toHaveBeenCalled()
  })

  it('should coordinate parent and child resources independently', async () => {
    const parentFile = { ...dbFile, path: 'docs' }
    const parentStateKey = `${CACHE_LOCK_PREFIX}|ownerId:10|${CACHE_LOCK_NATIVE_SCOPE_SEGMENT}|path:docs`
    const [parent, child] = await Promise.all([
      filesLockManager.create(user, parentFile, WEBDAV_APP_LOCK, DEPTH.INFINITY),
      filesLockManager.create(user, dbFile, WEBDAV_APP_LOCK, DEPTH.RESOURCE)
    ])

    expect(parent[0]).toBe(true)
    expect(child[0]).toBe(true)
    expect(cacheStore.has(parentStateKey)).toBe(true)
    expect(cacheStore.has(stateKey)).toBe(true)
  })

  it('should stop retrying compare-and-swap misses at the deadline', async () => {
    ;(filesLockManager as any).stateRetryTimeout = 1
    cache.compareAndSwap.mockResolvedValue(false)

    await expect(filesLockManager.create(user, dbFile, WEBDAV_APP_LOCK, DEPTH.RESOURCE)).rejects.toThrow('Unable to coordinate file lock operation')
  })

  it('should fence refresh and deletion with lockId', async () => {
    const currentLock = makeLock({ lockId: 'current-id' })
    const staleLock = { ...currentLock, lockId: 'stale-id' }
    setState(stateKey, [currentLock])

    await expect(filesLockManager.refreshLockTimeout(dbFile, staleLock, 120)).resolves.toBe(false)
    await expect(filesLockManager.removeLock(dbFile, staleLock)).resolves.toBe(false)
    expect(cacheStore.get(stateKey)?.locks).toEqual([currentLock])

    const handleBeforeRefresh = { ...currentLock }
    await expect(filesLockManager.refreshLockTimeout(dbFile, currentLock, 120)).resolves.toBe(true)
    expect(currentLock.lockId).not.toBe(handleBeforeRefresh.lockId)
    await expect(filesLockManager.removeLock(dbFile, handleBeforeRefresh)).resolves.toBe(false)
    await expect(filesLockManager.removeLock(dbFile, currentLock)).resolves.toBe(true)
    expect(cacheStore.has(stateKey)).toBe(false)
  })

  it('should remove a token lock with one read and one compare-and-swap', async () => {
    const lock = makeLock({
      options: { lockRoot: '/webdav/docs/file.txt', lockToken: 'token-1', lockScope: LOCK_SCOPE.EXCLUSIVE }
    })
    setState(stateKey, [lock])

    await expect(filesLockManager.removeLockByToken(dbFile, 'token-1', user.id)).resolves.toEqual([true, lock])

    expect(cache.get).toHaveBeenCalledOnce()
    expect(cache.compareAndSwap).toHaveBeenCalledOnce()
    expect(cacheStore.has(stateKey)).toBe(false)
  })

  it('should refresh a token lock with one read and one compare-and-swap', async () => {
    const lock = makeLock({
      options: { lockRoot: '/webdav/docs/file.txt', lockToken: 'token-1', lockScope: LOCK_SCOPE.EXCLUSIVE }
    })
    setState(stateKey, [lock])

    const [refreshed, refreshedLock] = await filesLockManager.refreshLockByToken(dbFile, 'token-1', 120, user.id)

    expect(refreshed).toBe(true)
    expect(refreshedLock?.lockId).not.toBe(lock.lockId)
    expect(cache.get).toHaveBeenCalledOnce()
    expect(cache.compareAndSwap).toHaveBeenCalledOnce()
    expect(cacheStore.get(stateKey)?.locks).toEqual([refreshedLock])
  })

  it('should not mutate an absent token or a token owned by another user', async () => {
    const foreignLock = makeLock({
      owner: { ...user.asOwner(), id: 42, login: 'alice' },
      options: { lockRoot: '/webdav/docs/file.txt', lockToken: 'token-1', lockScope: LOCK_SCOPE.EXCLUSIVE }
    })
    setState(stateKey, [foreignLock])

    await expect(filesLockManager.removeLockByToken(dbFile, 'missing', user.id)).resolves.toEqual([false, null])
    await expect(filesLockManager.refreshLockByToken(dbFile, 'token-1', 120, user.id)).resolves.toEqual([false, foreignLock])

    expect(cache.compareAndSwap).not.toHaveBeenCalled()
    expect(cacheStore.get(stateKey)?.locks).toEqual([foreignLock])
  })

  it('should fence token mutations against a replacement incarnation', async () => {
    const lock = makeLock({
      options: { lockRoot: '/webdav/docs/file.txt', lockToken: 'token-1', lockScope: LOCK_SCOPE.EXCLUSIVE }
    })
    const replacement = { ...lock, lockId: 'replacement-id' }
    setState(stateKey, [lock])
    cache.compareAndSwap.mockImplementationOnce(async () => {
      setState(stateKey, [replacement], 'version-2')
      return false
    })

    await expect(filesLockManager.removeLockByToken(dbFile, 'token-1', user.id)).resolves.toEqual([false, lock])

    expect(cache.get).toHaveBeenCalledTimes(2)
    expect(cache.compareAndSwap).toHaveBeenCalledOnce()
    expect(cacheStore.get(stateKey)?.locks).toEqual([replacement])
  })

  it('should retry a token mutation when its captured incarnation is unchanged', async () => {
    const lock = makeLock({
      options: { lockRoot: '/webdav/docs/file.txt', lockToken: 'token-1', lockScope: LOCK_SCOPE.SHARED }
    })
    const concurrentLock = makeLock({
      lockId: 'concurrent-id',
      key: `${stateKey}|depth:0|token:token-2`,
      options: { lockRoot: '/webdav/docs/file.txt', lockToken: 'token-2', lockScope: LOCK_SCOPE.SHARED }
    })
    setState(stateKey, [lock])
    cache.compareAndSwap.mockImplementationOnce(async () => {
      setState(stateKey, [lock, concurrentLock], 'version-2')
      return false
    })

    await expect(filesLockManager.removeLockByToken(dbFile, 'token-1', user.id)).resolves.toEqual([true, lock])

    expect(cache.get).toHaveBeenCalledTimes(2)
    expect(cache.compareAndSwap).toHaveBeenCalledTimes(2)
    expect(cacheStore.get(stateKey)?.locks).toEqual([concurrentLock])
  })

  it('should not refresh a replacement incarnation with the same token', async () => {
    const lock = makeLock({
      options: { lockRoot: '/webdav/docs/file.txt', lockToken: 'token-1', lockScope: LOCK_SCOPE.EXCLUSIVE }
    })
    const replacement = { ...lock, lockId: 'replacement-id' }
    setState(stateKey, [lock])
    cache.compareAndSwap.mockImplementationOnce(async () => {
      setState(stateKey, [replacement], 'version-2')
      return false
    })

    await expect(filesLockManager.refreshLockByToken(dbFile, 'token-1', 120, user.id)).resolves.toEqual([false, lock])

    expect(cache.get).toHaveBeenCalledTimes(2)
    expect(cache.compareAndSwap).toHaveBeenCalledOnce()
    expect(cacheStore.get(stateKey)?.locks).toEqual([replacement])
  })

  it('should prepare and remove exact and descendant locks by exact state', async () => {
    const parentFile = { ...dbFile, path: 'docs' }
    const parentStateKey = `${CACHE_LOCK_PREFIX}|ownerId:10|${CACHE_LOCK_NATIVE_SCOPE_SEGMENT}|path:docs`
    const firstStateKey = `${parentStateKey}/caf\u00e9.txt`
    const secondStateKey = `${parentStateKey}/b.txt`
    const root = makeLock({ lockId: 'root-id', key: `${parentStateKey}|depth:0`, dbFilePath: 'docs' })
    const first = makeLock({
      key: `${firstStateKey}|depth:0|token:first`,
      dbFilePath: 'Docs/Caf\u00e9.txt',
      options: { lockRoot: '/webdav/docs/cafe', lockToken: 'first', lockScope: LOCK_SCOPE.SHARED }
    })
    const firstShared = makeLock({
      lockId: 'first-shared-id',
      key: `${firstStateKey}|depth:0|token:shared`,
      dbFilePath: 'docs/cafe\u0301.txt',
      options: { lockRoot: '/webdav/docs/cafe', lockToken: 'shared', lockScope: LOCK_SCOPE.SHARED }
    })
    const second = makeLock({ lockId: 'lock-id-2', key: `${secondStateKey}|depth:0`, dbFilePath: 'docs/b.txt' })
    setState(parentStateKey, [root])
    setState(firstStateKey, [first, firstShared])
    setState(secondStateKey, [second])

    const cleanup = await filesLockManager.prepareCleanup(user, parentFile, { includeExact: true, includeDescendants: true })

    expect(cache.keys).toHaveBeenCalledWith(`${parentStateKey}/*`)
    expect(cache.compareAndSwap).not.toHaveBeenCalled()

    await cleanup.remove()

    expect(cacheStore.has(parentStateKey)).toBe(false)
    expect(cacheStore.has(firstStateKey)).toBe(false)
    expect(cacheStore.has(secondStateKey)).toBe(false)
    expect(cache.compareAndSwap.mock.calls.map(([command]) => command.key)).toEqual([parentStateKey, firstStateKey, secondStateKey])
  })

  it('should discover descendants through equivalent path identities', async () => {
    const parentFile = { ...dbFile, path: 'D\u00f3cs' }
    const parentStateKey = `${CACHE_LOCK_PREFIX}|ownerId:10|${CACHE_LOCK_NATIVE_SCOPE_SEGMENT}|path:d\u00f3cs`
    const childStateKey = `${parentStateKey}/file.txt`
    const child = makeLock({ key: `${childStateKey}|depth:0`, dbFilePath: 'DO\u0301CS/File.txt' })
    setState(childStateKey, [child])

    const cleanup = await filesLockManager.prepareCleanup(user, parentFile, { includeExact: false, includeDescendants: true })

    expect(cache.keys).toHaveBeenCalledWith(`${parentStateKey}/*`)
    await cleanup.remove()
    expect(cacheStore.has(childStateKey)).toBe(false)
  })

  it('should preserve exact locks while cleaning descendants', async () => {
    const parentFile = { ...dbFile, path: 'docs' }
    const parentStateKey = `${CACHE_LOCK_PREFIX}|ownerId:10|${CACHE_LOCK_NATIVE_SCOPE_SEGMENT}|path:docs`
    const childStateKey = `${parentStateKey}/file.txt`
    const root = makeLock({ key: `${parentStateKey}|depth:0`, dbFilePath: 'docs' })
    const child = makeLock({ key: `${childStateKey}|depth:0`, dbFilePath: 'docs/file.txt' })
    setState(parentStateKey, [root])
    setState(childStateKey, [child])

    const cleanup = await filesLockManager.prepareCleanup(user, parentFile, { includeExact: false, includeDescendants: true })
    await cleanup.remove()

    expect(cacheStore.get(parentStateKey)?.locks).toEqual([root])
    expect(cacheStore.has(childStateKey)).toBe(false)
  })

  it('should apply removal ownership only to the exact target', async () => {
    const parentFile = { ...dbFile, path: 'docs' }
    const parentStateKey = `${CACHE_LOCK_PREFIX}|ownerId:10|${CACHE_LOCK_NATIVE_SCOPE_SEGMENT}|path:docs`
    const childStateKey = `${parentStateKey}/b.txt`
    const foreignChild = makeLock({
      lockId: 'foreign-child',
      key: `${childStateKey}|depth:0`,
      dbFilePath: 'docs/b.txt',
      owner: { ...user.asOwner(), id: 42, login: 'alice' }
    })
    setState(childStateKey, [foreignChild])

    const cleanup = await filesLockManager.prepareCleanup(user, parentFile, { includeExact: true, includeDescendants: true })
    await cleanup.remove()
    expect(cacheStore.has(childStateKey)).toBe(false)

    const foreignRoot = makeLock({
      lockId: 'foreign-root',
      key: `${parentStateKey}|depth:0`,
      dbFilePath: 'docs',
      owner: { ...user.asOwner(), id: 42, login: 'alice' }
    })
    setState(parentStateKey, [foreignRoot])
    await expect(filesLockManager.prepareCleanup(user, parentFile, { includeExact: true, includeDescendants: true })).rejects.toBeInstanceOf(
      LockConflict
    )
  })

  it('should reject handles from another exact resource', async () => {
    const child = makeLock({ key: `${stateKey}/a.txt|depth:0`, dbFilePath: 'docs/a.txt' })

    await expect(filesLockManager.removeLock({ ...dbFile, path: 'docs' }, child)).resolves.toBe(false)
    await expect(filesLockManager.refreshLockTimeout(dbFile, child, 120)).resolves.toBe(false)
    expect(cache.compareAndSwap).not.toHaveBeenCalled()
  })

  it('should remove matching captures and preserve replacement incarnations', async () => {
    const first = makeLock({
      key: `${stateKey}|depth:0|token:t1`,
      options: { lockRoot: null, lockToken: 't1', lockScope: LOCK_SCOPE.SHARED }
    })
    const second = makeLock({
      lockId: 'lock-id-2',
      key: `${stateKey}|depth:0|token:t2`,
      options: { lockRoot: null, lockToken: 't2', lockScope: LOCK_SCOPE.SHARED }
    })
    setState(stateKey, [first, second])
    const cleanup = await filesLockManager.prepareCleanup(user, dbFile, { includeExact: true, includeDescendants: false })
    const replacement = { ...second, lockId: 'replacement-id' }
    setState(stateKey, [first, replacement], 'version-2')

    await cleanup.remove()
    expect(cacheStore.get(stateKey)?.locks).toEqual([replacement])
  })

  it('should keep exact cleanup available when descendant capture fails', async () => {
    const parentFile = { ...dbFile, path: 'docs' }
    const parentStateKey = `${CACHE_LOCK_PREFIX}|ownerId:10|${CACHE_LOCK_NATIVE_SCOPE_SEGMENT}|path:docs`
    const root = makeLock({ key: `${parentStateKey}|depth:0`, dbFilePath: 'docs' })
    setState(parentStateKey, [root])
    cache.keys.mockRejectedValueOnce(new Error('descendant scan failed'))

    const cleanup = await filesLockManager.prepareCleanup(user, parentFile, { includeExact: true, includeDescendants: true })
    await cleanup.remove()

    expect(cacheStore.has(parentStateKey)).toBe(false)
  })

  it('should keep captured cleanup best effort when compare-and-swap fails', async () => {
    const parentFile = { ...dbFile, path: 'docs' }
    const parentStateKey = `${CACHE_LOCK_PREFIX}|ownerId:10|${CACHE_LOCK_NATIVE_SCOPE_SEGMENT}|path:docs`
    const childStateKey = `${parentStateKey}/file.txt`
    const child = makeLock({ key: `${childStateKey}|depth:0`, dbFilePath: 'docs/file.txt' })
    setState(childStateKey, [child])
    const cleanup = await filesLockManager.prepareCleanup(user, parentFile, { includeExact: false, includeDescendants: true })
    cache.compareAndSwap.mockRejectedValueOnce(new Error('cleanup failed'))

    await expect(cleanup.remove()).resolves.toBeUndefined()
    expect(cacheStore.get(childStateKey)?.locks).toEqual([child])
  })

  it('should resolve tokens only on the exact requested path', async () => {
    const parentStateKey = `${CACHE_LOCK_PREFIX}|ownerId:10|${CACHE_LOCK_NATIVE_SCOPE_SEGMENT}|path:docs`
    const lock = makeLock({
      dbFilePath: 'docs',
      depth: DEPTH.INFINITY,
      key: `${parentStateKey}|depth:infinity|token:opaquelocktoken:t1`,
      options: { lockRoot: '/webdav/docs', lockToken: 'opaquelocktoken:t1', lockScope: LOCK_SCOPE.EXCLUSIVE }
    })
    setState(parentStateKey, [lock])

    await expect(filesLockManager.getLockByToken('opaquelocktoken:t1', dbFile)).resolves.toBeNull()
    await expect(filesLockManager.getLockByToken('opaquelocktoken:t1', { ...dbFile, path: 'docs' })).resolves.toBe(lock)
  })

  it('should ignore parent locks and enforce conflicts on the exact path', async () => {
    const parentStateKey = `${CACHE_LOCK_PREFIX}|ownerId:10|${CACHE_LOCK_NATIVE_SCOPE_SEGMENT}|path:docs`
    const parentLock = makeLock({
      dbFilePath: 'docs',
      depth: DEPTH.INFINITY,
      key: `${parentStateKey}|depth:infinity`,
      owner: { ...user.asOwner(), id: 99, login: 'other' }
    })
    setState(parentStateKey, [parentLock])

    await expect(filesLockManager.checkConflicts(dbFile, DEPTH.RESOURCE, { userId: user.id })).resolves.toBeUndefined()

    const exactLock = makeLock({ owner: { ...user.asOwner(), id: 99, login: 'other' } })
    setState(stateKey, [exactLock])
    await expect(filesLockManager.checkConflicts(dbFile, DEPTH.RESOURCE, { userId: user.id })).rejects.toEqual(
      new LockConflict(exactLock, 'conflicting lock : docs/file.txt (other)')
    )
  })

  it('should ignore expired members in reads and transitions', async () => {
    const expired = makeLock({ lockId: 'expired', expiration: currentTimeStamp() - 1 })
    const active = makeLock({ lockId: 'active', key: `${stateKey}|depth:0|token:active` })
    setState(stateKey, [expired, active])

    await expect(filesLockManager.getLocksByPath(dbFile)).resolves.toEqual([active])
    await expect(filesLockManager.removeLock(dbFile, active)).resolves.toBe(true)
    expect(cacheStore.has(stateKey)).toBe(false)
  })

  it('should browse direct children through non-decision state reads', async () => {
    const parentFile = { ...dbFile, path: 'docs' }
    const parentStateKey = `${CACHE_LOCK_PREFIX}|ownerId:10|${CACHE_LOCK_NATIVE_SCOPE_SEGMENT}|path:docs`
    const childStateKey = `${parentStateKey}/__proto__`
    const sameNameChildStateKey = `${parentStateKey}/docs`
    const grandChildStateKey = `${parentStateKey}/sub/b.txt`
    const root = makeLock({ key: `${parentStateKey}|depth:0`, dbFilePath: 'docs' })
    const sharedRoot = makeLock({ lockId: 'shared-root-id', key: `${parentStateKey}|depth:0|token:shared`, dbFilePath: 'docs' })
    const child = makeLock({ lockId: 'child-id', key: `${childStateKey}|depth:0`, dbFilePath: 'docs/__proto__' })
    const sameNameChild = makeLock({ lockId: 'same-name-child-id', key: `${sameNameChildStateKey}|depth:0`, dbFilePath: 'docs/docs' })
    const grandChild = makeLock({ lockId: 'grand-child-id', key: `${grandChildStateKey}|depth:0`, dbFilePath: 'docs/sub/b.txt' })
    setState(parentStateKey, [root, sharedRoot])
    setState(childStateKey, [child])
    setState(sameNameChildStateKey, [sameNameChild])
    setState(grandChildStateKey, [grandChild])

    const discovery = await filesLockManager.browseParentChildLocks(parentFile)
    expect(Object.getPrototypeOf(discovery.children)).toBeNull()
    expect(discovery.root).toEqual([root, sharedRoot])
    expect(discovery.children.docs).toEqual([sameNameChild])
    expect(discovery.children['__proto__']).toEqual([child])
    expect(cache.keys).toHaveBeenCalledWith(`${CACHE_LOCK_PREFIX}|ownerId:10|${CACHE_LOCK_NATIVE_SCOPE_SEGMENT}|path:*`)
  })
})
