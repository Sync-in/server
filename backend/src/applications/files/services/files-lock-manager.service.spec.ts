import { Test, TestingModule } from '@nestjs/testing'
import { currentTimeStamp } from '../../../common/shared.js'
import { Cache } from '../../../infrastructure/cache/cache.service.js'
import {
  CACHE_REVISION_MAX_MUTATIONS,
  type CacheRevisionCommit,
  type CacheRevisionMutationCommit,
  type CacheRevisionSnapshotCommand
} from '../../../infrastructure/cache/interfaces/cache-revision.interface.js'
import { DEPTH, LOCK_SCOPE, WEBDAV_APP_LOCK } from '../../webdav/constants/webdav.js'
import { CACHE_LOCK_NATIVE_SCOPE_SEGMENT, CACHE_LOCK_PREFIX, CACHE_LOCK_REVISION_PREFIX } from '../constants/cache.js'
import type { FileDBProps } from '../interfaces/file-db-props.interface.js'
import type { FileLock } from '../interfaces/file-lock.interface.js'
import { LockConflict } from '../models/file-lock-error.js'
import { FilesLockManager } from './files-lock-manager.service.js'
import type { Mock } from 'vitest'

describe(FilesLockManager.name, () => {
  let filesLockManager: FilesLockManager
  let cacheStore: Map<string, any>
  let revisionCounter: number
  let cache: {
    readRevisionSnapshot: Mock
    commitRevision: Mock
    mutateRevision: Mock
  }

  const dbFile = { path: 'docs/file.txt', ownerId: 10, inTrash: false } as FileDBProps
  const user = {
    id: 10,
    login: 'john',
    asOwner: () => ({ id: 10, login: 'john', email: 'john@sync-in.com', fullName: 'John' })
  } as any
  const revisionKey = `${CACHE_LOCK_REVISION_PREFIX}|ownerId:10`

  const createPatternRegex = (pattern: string): RegExp => {
    const escapedPattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
    return new RegExp(`^${escapedPattern}$`)
  }

  const makeLock = (overrides: Partial<FileLock> = {}): FileLock => ({
    lockId: 'lock-id-1',
    owner: user.asOwner(),
    dbFilePath: dbFile.path,
    key: `${CACHE_LOCK_PREFIX}|ownerId:10|${CACHE_LOCK_NATIVE_SCOPE_SEGMENT}|path:${dbFile.path}|depth:0`,
    app: WEBDAV_APP_LOCK,
    depth: DEPTH.RESOURCE,
    expiration: currentTimeStamp() + 300,
    ...overrides
  })

  const applyMutations = (command: CacheRevisionMutationCommit): boolean => {
    for (const mutation of command.mutations) {
      const current = cacheStore.get(mutation.key)
      if (mutation.expect === 'absent' ? current !== undefined : current === undefined) return false
      if (mutation.expectedLockId && current?.lockId !== mutation.expectedLockId) return false
    }
    for (const mutation of command.mutations) {
      if (mutation.type === 'set') cacheStore.set(mutation.key, mutation.value)
      else cacheStore.delete(mutation.key)
    }
    cacheStore.set(command.revisionKey, `revision-${++revisionCounter}`)
    return true
  }

  const commitRevision = async (command: CacheRevisionCommit): Promise<boolean> => {
    if ((cacheStore.get(command.revisionKey) ?? null) !== command.expectedRevision) return false
    return applyMutations(command)
  }

  const mutateRevision = async (command: CacheRevisionMutationCommit): Promise<boolean> => applyMutations(command)

  const readRevisionSnapshot = async (command: CacheRevisionSnapshotCommand) => ({
    revision: cacheStore.get(command.revisionKey) ?? null,
    entries: [...cacheStore.entries()].filter(([key]) => createPatternRegex(command.pattern).test(key)).map(([key, value]) => ({ key, value }))
  })

  beforeEach(async () => {
    revisionCounter = 0
    cacheStore = new Map<string, any>()
    cache = {
      readRevisionSnapshot: vi.fn(readRevisionSnapshot),
      commitRevision: vi.fn(commitRevision),
      mutateRevision: vi.fn(mutateRevision)
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

  it('should atomically create a lock and its namespace revision', async () => {
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
    expect(cacheStore.get(lock.key)).toEqual(lock)
    expect(cacheStore.get(revisionKey)).toBe('revision-1')
    expect(cache.commitRevision).toHaveBeenCalledWith({
      revisionKey,
      expectedRevision: null,
      mutations: [{ type: 'set', key: lock.key, value: lock, ttl: 100, expect: 'absent' }]
    })
  })

  it('should share one revision while isolating native and external-root scopes', async () => {
    const baseFile = { path: 'same/file.txt', spaceId: 1, inTrash: false } as FileDBProps
    const externalFile = { path: 'same/file.txt', spaceId: 1, spaceExternalRootId: 2, inTrash: false } as FileDBProps
    const spaceRevisionKey = `${CACHE_LOCK_REVISION_PREFIX}|spaceId:1`

    const [, externalLock] = await filesLockManager.create(user, externalFile, WEBDAV_APP_LOCK, DEPTH.RESOURCE)
    const [, baseLock] = await filesLockManager.create(user, baseFile, WEBDAV_APP_LOCK, DEPTH.RESOURCE)

    expect(externalLock.key).toBe(`${CACHE_LOCK_PREFIX}|spaceId:1|spaceExternalRootId:2|path:same/file.txt|depth:0`)
    expect(baseLock.key).toBe(`${CACHE_LOCK_PREFIX}|spaceId:1|${CACHE_LOCK_NATIVE_SCOPE_SEGMENT}|path:same/file.txt|depth:0`)
    expect(cache.commitRevision.mock.calls.map(([command]) => command.revisionKey)).toEqual([spaceRevisionKey, spaceRevisionKey])
    expect(cache.commitRevision.mock.calls[1][0].expectedRevision).toBe('revision-1')
    expect(cache.readRevisionSnapshot).toHaveBeenNthCalledWith(1, {
      revisionKey: spaceRevisionKey,
      pattern: `${CACHE_LOCK_PREFIX}|spaceId:1|spaceExternalRootId:2|*`
    })
    expect(cache.readRevisionSnapshot).toHaveBeenNthCalledWith(2, {
      revisionKey: spaceRevisionKey,
      pattern: `${CACHE_LOCK_PREFIX}|spaceId:1|${CACHE_LOCK_NATIVE_SCOPE_SEGMENT}|*`
    })
  })

  it('should validate and return an existing conflict without committing', async () => {
    const conflictLock = makeLock({ owner: { ...user.asOwner(), id: 99, login: 'other' } })
    cacheStore.set(conflictLock.key, conflictLock)

    const [created, lock] = await filesLockManager.create(user, dbFile, WEBDAV_APP_LOCK, DEPTH.RESOURCE)

    expect(created).toBe(false)
    expect(lock).toBe(conflictLock)
    expect(cache.commitRevision).not.toHaveBeenCalled()
  })

  it('should retry a stale CAS from a fresh snapshot', async () => {
    cache.commitRevision.mockResolvedValueOnce(false).mockImplementation(commitRevision)

    const [created, lock] = await filesLockManager.create(user, dbFile, WEBDAV_APP_LOCK, DEPTH.RESOURCE, null, 60)

    expect(created).toBe(true)
    expect(cache.commitRevision).toHaveBeenCalledTimes(2)
    expect(cacheStore.get(lock.key)).toEqual(lock)
  })

  it('should atomically refresh every owned lock on the path', async () => {
    const first = makeLock({ expiration: currentTimeStamp() + 10 })
    const second = makeLock({
      lockId: 'lock-id-2',
      key: `${CACHE_LOCK_PREFIX}|ownerId:10|${CACHE_LOCK_NATIVE_SCOPE_SEGMENT}|path:${dbFile.path}|depth:0|token:t2`,
      expiration: currentTimeStamp() + 10
    })
    cacheStore.set(first.key, first)
    cacheStore.set(second.key, second)

    const [created, lock] = await filesLockManager.createOrRefresh(user, dbFile, WEBDAV_APP_LOCK, DEPTH.RESOURCE, 300)

    expect(created).toBe(false)
    expect(lock.lockId).not.toBe(first.lockId)
    expect(cacheStore.get(first.key).lockId).toBe(lock.lockId)
    expect(cacheStore.get(second.key).lockId).not.toBe(second.lockId)
    expect(cache.commitRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        mutations: expect.arrayContaining([
          expect.objectContaining({ key: first.key, expect: 'present', expectedLockId: first.lockId }),
          expect.objectContaining({ key: second.key, expect: 'present', expectedLockId: second.lockId })
        ])
      })
    )
  })

  it('should reject createOrRefresh when another owner holds the path', async () => {
    const conflictLock = makeLock({ owner: { ...user.asOwner(), id: 42, login: 'alice' } })
    cacheStore.set(conflictLock.key, conflictLock)

    await expect(filesLockManager.createOrRefresh(user, dbFile, WEBDAV_APP_LOCK, DEPTH.RESOURCE)).rejects.toEqual(
      new LockConflict(conflictLock, 'Conflicting lock')
    )
    expect(cache.commitRevision).not.toHaveBeenCalled()
  })

  it('should fence a shared-lock refresh with the previous lockId', async () => {
    const options = { lockRoot: '/webdav/docs/file.txt', lockToken: 'opaquelocktoken:shared', lockScope: LOCK_SCOPE.SHARED }
    const existingLock = makeLock({
      key: `${CACHE_LOCK_PREFIX}|ownerId:10|${CACHE_LOCK_NATIVE_SCOPE_SEGMENT}|path:${dbFile.path}|depth:0|token:${options.lockToken}`,
      options
    })
    cacheStore.set(existingLock.key, existingLock)

    const [created, refreshedLock] = await filesLockManager.create(user, dbFile, WEBDAV_APP_LOCK, DEPTH.RESOURCE, options, 300)

    expect(created).toBe(true)
    expect(refreshedLock.lockId).not.toBe(existingLock.lockId)
    expect(cache.commitRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        mutations: [expect.objectContaining({ value: refreshedLock, expectedLockId: existingLock.lockId })]
      })
    )
  })

  it('should fence every reuse of a fresh owned lock in createOrRefresh', async () => {
    const lock = makeLock({ expiration: currentTimeStamp() + 300 })
    const staleHandle = { ...lock }
    cacheStore.set(lock.key, lock)

    const [created, result] = await filesLockManager.createOrRefresh(user, dbFile, WEBDAV_APP_LOCK, DEPTH.RESOURCE, 300)

    expect(created).toBe(false)
    expect(result.lockId).not.toBe(staleHandle.lockId)
    expect(cache.commitRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        mutations: [expect.objectContaining({ value: result, expectedLockId: staleHandle.lockId })]
      })
    )
    await expect(filesLockManager.removeLock(dbFile, staleHandle)).resolves.toBe(false)
    expect(cacheStore.get(lock.key).lockId).toBe(result.lockId)
  })

  it('should let only one concurrent parent or child creation win across manager instances', async () => {
    const otherManager = new FilesLockManager(cache as unknown as Cache)
    const parentFile = { ...dbFile, path: 'docs' }
    const [parent, child] = await Promise.all([
      filesLockManager.create(user, parentFile, WEBDAV_APP_LOCK, DEPTH.INFINITY),
      otherManager.create(user, dbFile, WEBDAV_APP_LOCK, DEPTH.RESOURCE)
    ])

    expect([parent, child].filter(([created]) => created)).toHaveLength(1)
    expect(parent[1].lockId).toBe(child[1].lockId)
  })

  it('should stop retrying stale revisions at the configured deadline', async () => {
    ;(filesLockManager as any).revisionRetryTimeout = 1
    cache.commitRevision.mockResolvedValue(false)

    await expect(filesLockManager.create(user, dbFile, WEBDAV_APP_LOCK, DEPTH.RESOURCE)).rejects.toThrow('Unable to coordinate file lock operation')
  })

  it('should include time spent waiting in the namespace queue in the retry deadline', async () => {
    vi.useFakeTimers()
    try {
      ;(filesLockManager as any).namespaceQueues.set(revisionKey, new Set())
      vi.spyOn(performance, 'now').mockReturnValue(0)

      const creation = filesLockManager.create(user, dbFile, WEBDAV_APP_LOCK, DEPTH.RESOURCE)
      const rejection = expect(creation).rejects.toThrow('Unable to coordinate file lock operation')
      await vi.advanceTimersByTimeAsync(2_000)

      await rejection
      expect(cache.readRevisionSnapshot).not.toHaveBeenCalled()
      expect((filesLockManager as any).namespaceQueues.get(revisionKey).size).toBe(0)
    } finally {
      ;(filesLockManager as any).releaseNamespace(revisionKey)
      vi.useRealTimers()
    }
  })

  it('should bound queue waiting for known-lock mutations', async () => {
    const lock = makeLock()
    ;(filesLockManager as any).namespaceQueues.set(revisionKey, new Set())
    vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValue(2_001)

    const refresh = filesLockManager.refreshLockTimeout(dbFile, lock, 120)
    ;(filesLockManager as any).releaseNamespace(revisionKey)

    await expect(refresh).rejects.toThrow('Unable to coordinate file lock operation')
    expect(cache.mutateRevision).not.toHaveBeenCalled()
  })

  it('should fence refresh and deletion with lockId', async () => {
    const currentLock = makeLock({ lockId: 'current-id' })
    const staleLock = { ...currentLock, lockId: 'stale-id' }
    cacheStore.set(currentLock.key, currentLock)

    await expect(filesLockManager.refreshLockTimeout(dbFile, staleLock, 120)).resolves.toBe(false)
    await expect(filesLockManager.removeLock(dbFile, staleLock)).resolves.toBe(false)
    expect(cacheStore.get(currentLock.key)).toBe(currentLock)
    expect(cache.commitRevision).not.toHaveBeenCalled()

    const handleBeforeRefresh = { ...currentLock }
    await expect(filesLockManager.refreshLockTimeout(dbFile, currentLock, 120)).resolves.toBe(true)
    expect(currentLock.lockId).not.toBe(handleBeforeRefresh.lockId)
    await expect(filesLockManager.removeLock(dbFile, handleBeforeRefresh)).resolves.toBe(false)
    expect(cacheStore.get(currentLock.key).lockId).toBe(currentLock.lockId)
    await expect(filesLockManager.removeLock(dbFile, currentLock)).resolves.toBe(true)
    expect(cacheStore.has(currentLock.key)).toBe(false)
  })

  it('should refresh a captured lock without reading the namespace', async () => {
    const lock = makeLock()
    const expectedLockId = lock.lockId
    cacheStore.set(lock.key, lock)

    await expect(filesLockManager.refreshLockTimeout(dbFile, lock, 120)).resolves.toBe(true)

    expect(cache.readRevisionSnapshot).not.toHaveBeenCalled()
    expect(cache.mutateRevision).toHaveBeenCalledWith({
      revisionKey,
      mutations: [expect.objectContaining({ type: 'set', key: lock.key, expect: 'present', expectedLockId })]
    })
  })

  it('should capture and delete owned exact and child locks in one revision batch', async () => {
    const root = makeLock({
      lockId: 'root-id',
      key: `${CACHE_LOCK_PREFIX}|ownerId:10|${CACHE_LOCK_NATIVE_SCOPE_SEGMENT}|path:docs|depth:0`,
      dbFilePath: 'docs'
    })
    const first = makeLock({
      key: `${CACHE_LOCK_PREFIX}|ownerId:10|${CACHE_LOCK_NATIVE_SCOPE_SEGMENT}|path:docs/a.txt|depth:0`,
      dbFilePath: 'docs/a.txt'
    })
    const second = makeLock({
      lockId: 'lock-id-2',
      key: `${CACHE_LOCK_PREFIX}|ownerId:10|${CACHE_LOCK_NATIVE_SCOPE_SEGMENT}|path:docs/b.txt|depth:0`,
      dbFilePath: 'docs/b.txt'
    })
    cacheStore.set(root.key, root)
    cacheStore.set(first.key, first)
    cacheStore.set(second.key, second)

    const parentFile = { ...dbFile, path: 'docs' }
    const locks = await filesLockManager.getLocksForRemoval(user, parentFile, true)
    expect(cache.readRevisionSnapshot).toHaveBeenCalledTimes(1)
    await expect(filesLockManager.removeLocks(parentFile, locks)).resolves.toBe(true)

    expect(cache.readRevisionSnapshot).toHaveBeenCalledTimes(1)
    expect(cache.mutateRevision).toHaveBeenCalledTimes(1)
    expect(cache.mutateRevision).toHaveBeenCalledWith({
      revisionKey,
      mutations: [
        { type: 'delete', key: root.key, expect: 'present', expectedLockId: root.lockId },
        { type: 'delete', key: first.key, expect: 'present', expectedLockId: first.lockId },
        { type: 'delete', key: second.key, expect: 'present', expectedLockId: second.lockId }
      ]
    })
    expect(cacheStore.has(root.key)).toBe(false)
    expect(cacheStore.has(first.key)).toBe(false)
    expect(cacheStore.has(second.key)).toBe(false)
  })

  it('should reject a captured batch before deletion when one lock belongs to another owner', async () => {
    const owned = makeLock({
      key: `${CACHE_LOCK_PREFIX}|ownerId:10|${CACHE_LOCK_NATIVE_SCOPE_SEGMENT}|path:docs/a.txt|depth:0`,
      dbFilePath: 'docs/a.txt'
    })
    const foreign = makeLock({
      lockId: 'foreign-id',
      key: `${CACHE_LOCK_PREFIX}|ownerId:10|${CACHE_LOCK_NATIVE_SCOPE_SEGMENT}|path:docs/b.txt|depth:0`,
      dbFilePath: 'docs/b.txt',
      owner: { ...user.asOwner(), id: 42, login: 'alice' }
    })
    cacheStore.set(owned.key, owned)
    cacheStore.set(foreign.key, foreign)

    await expect(filesLockManager.getLocksForRemoval(user, { ...dbFile, path: 'docs' }, true)).rejects.toBeInstanceOf(LockConflict)
    expect(cache.commitRevision).not.toHaveBeenCalled()
    expect(cacheStore.has(owned.key)).toBe(true)
  })

  it('should leave replacement incarnations untouched while deleting the rest of a captured batch', async () => {
    const first = makeLock({
      key: `${CACHE_LOCK_PREFIX}|ownerId:10|${CACHE_LOCK_NATIVE_SCOPE_SEGMENT}|path:docs/a.txt|depth:0`,
      dbFilePath: 'docs/a.txt'
    })
    const second = makeLock({
      lockId: 'lock-id-2',
      key: `${CACHE_LOCK_PREFIX}|ownerId:10|${CACHE_LOCK_NATIVE_SCOPE_SEGMENT}|path:docs/b.txt|depth:0`,
      dbFilePath: 'docs/b.txt'
    })
    cacheStore.set(first.key, first)
    cacheStore.set(second.key, second)
    const parentFile = { ...dbFile, path: 'docs' }
    const capturedLocks = await filesLockManager.getLocksForRemoval(user, parentFile, true)
    const replacement = { ...second, lockId: 'replacement-id' }
    cacheStore.set(second.key, replacement)

    await expect(filesLockManager.removeLocks(parentFile, capturedLocks)).resolves.toBe(false)

    expect(cacheStore.has(first.key)).toBe(false)
    expect(cacheStore.get(second.key)).toBe(replacement)
    expect(cache.commitRevision).toHaveBeenCalledWith(
      expect.objectContaining({ mutations: [{ type: 'delete', key: first.key, expect: 'present', expectedLockId: first.lockId }] })
    )
  })

  it('should reject oversized removal batches before any commit', async () => {
    for (let index = 0; index <= CACHE_REVISION_MAX_MUTATIONS; index++) {
      const lock = makeLock({
        lockId: `lock-id-${index}`,
        key: `${CACHE_LOCK_PREFIX}|ownerId:10|${CACHE_LOCK_NATIVE_SCOPE_SEGMENT}|path:docs/${index}.txt|depth:0`,
        dbFilePath: `docs/${index}.txt`
      })
      cacheStore.set(lock.key, lock)
    }

    await expect(filesLockManager.getLocksForRemoval(user, { ...dbFile, path: 'docs' }, true)).rejects.toThrow(
      `Cannot atomically remove more than ${CACHE_REVISION_MAX_MUTATIONS} file locks`
    )
    expect(cache.commitRevision).not.toHaveBeenCalled()
  })

  it('should resolve tokens only inside the requested namespace and applicable path', async () => {
    const lock = makeLock({
      dbFilePath: 'docs',
      depth: DEPTH.INFINITY,
      key: `${CACHE_LOCK_PREFIX}|ownerId:10|${CACHE_LOCK_NATIVE_SCOPE_SEGMENT}|path:docs|depth:infinity|token:opaquelocktoken:t1`,
      options: { lockRoot: '/webdav/docs', lockToken: 'opaquelocktoken:t1', lockScope: LOCK_SCOPE.EXCLUSIVE }
    })
    cacheStore.set(lock.key, lock)

    await expect(filesLockManager.getLockByToken('opaquelocktoken:t1', { ...dbFile, path: 'docs/sub/file.txt' })).resolves.toBe(lock)
    expect(cache.readRevisionSnapshot).toHaveBeenNthCalledWith(1, {
      revisionKey,
      pattern: `${CACHE_LOCK_PREFIX}|ownerId:10|${CACHE_LOCK_NATIVE_SCOPE_SEGMENT}|*|token:opaquelocktoken:t1`
    })
    await expect(filesLockManager.isLockedWithToken('opaquelocktoken:t1', { ...dbFile, path: 'other/path' })).resolves.toBeNull()
    await expect(
      filesLockManager.getLockByToken('opaquelocktoken:t1', { path: 'docs/sub/file.txt', ownerId: 11, inTrash: false })
    ).resolves.toBeNull()
  })

  it('should apply depth and ownership rules to a coherent conflict snapshot', async () => {
    const parentLock = makeLock({
      dbFilePath: 'docs',
      depth: DEPTH.INFINITY,
      key: `${CACHE_LOCK_PREFIX}|ownerId:10|${CACHE_LOCK_NATIVE_SCOPE_SEGMENT}|path:docs|depth:infinity`,
      owner: { ...user.asOwner(), id: 99, login: 'other' }
    })
    cacheStore.set(parentLock.key, parentLock)

    await expect(filesLockManager.checkConflicts(dbFile, DEPTH.RESOURCE, { userId: user.id })).rejects.toEqual(
      new LockConflict(parentLock, 'conflicting parent lock : docs/file.txt -> docs (other)')
    )
  })
})
