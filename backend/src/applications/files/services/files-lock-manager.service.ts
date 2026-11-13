import { Injectable, Logger } from '@nestjs/common'
import crypto from 'node:crypto'

import { toErrorMessage } from '../../../common/errors.js'
import { sleep } from '../../../common/functions.js'
import { currentTimeStamp } from '../../../common/shared.js'
import { Cache } from '../../../infrastructure/cache/cache.service.js'
import {
  CACHE_REVISION_MAX_MUTATIONS,
  type CacheRevisionMutation,
  type CacheRevisionSnapshot
} from '../../../infrastructure/cache/interfaces/cache-revision.interface.js'
import { UserModel } from '../../users/models/user.model.js'
import { DEPTH, LOCK_DEPTH, LOCK_PREFIX, LOCK_SCOPE } from '../../webdav/constants/webdav.js'
import { CACHE_LOCK_DEFAULT_TTL, CACHE_LOCK_NATIVE_SCOPE_SEGMENT, CACHE_LOCK_PREFIX, CACHE_LOCK_REVISION_PREFIX } from '../constants/cache.js'
import { FileDBProps } from '../interfaces/file-db-props.interface.js'
import type { FileLockNamespaceQueueWaiter } from '../interfaces/file-lock-namespace-queue.interface.js'
import type { FileLockTransition } from '../interfaces/file-lock-transition.interface.js'
import { FileLock, FileLockOptions, LOCK_APP } from '../interfaces/file-lock.interface.js'
import { FileLockProps } from '../interfaces/file-props.interface.js'
import { LockConflict } from '../models/file-lock-error.js'
import { files } from '../schemas/files.schema.js'
import { dirName, fileName } from '../utils/files.js'

@Injectable()
export class FilesLockManager {
  /* Philosophy
  Currently this manager only handles conflicting locks between multiple users, not between clients
  - The locks created from api
      * They do not contain a token key or a davLock property
      * They are exclusive only
      * They must have a depth of 'infinity' (all children) or '0' (root and root members)
  - The locks created from WebDAV or OnlyOffice or CollaboraOnline are stored with a token and a davLock property
      * They must have a depth of 'infinity' (all children) or '0' (root and root members)
      * They can be exclusive (WebDAV) or shared (OnlyOffice, CollaboraOnline)
      * If created with WebDAV, they are stored with a token and a davLock property
      * If created with OnlyOffice, they are stored with no token and a davLock property whose `locktoken` & `lockroot` properties are `null`
      * If created with CollaboraOnline, they are stored with token and a davLock property whose `lockroot` property is `null`
  Cache token key format = `flock|(ownerId|spaceId|shareExternalId):${number}|<storage-scope>|path:${path}|depth:${depth}|token?:${uuid}` => FileLock
  */
  private readonly logger = new Logger(FilesLockManager.name)
  private readonly revisionRetryTimeout = 2_000
  private readonly revisionRetryDelay = 10
  private readonly revisionRetryJitter = 20
  // See files-lock.md: this only reduces same-process CAS contention;
  // the revision sidecar remains the distributed authority.
  private readonly namespaceQueues = new Map<string, Set<FileLockNamespaceQueueWaiter>>()

  constructor(private readonly cache: Cache) {}

  async create(
    user: UserModel,
    dbFile: FileDBProps,
    app: LOCK_APP,
    depth: LOCK_DEPTH,
    options?: FileLockOptions | null,
    ttl?: number
  ): Promise<[succeeded: boolean, lock: FileLock]> {
    ttl = this.normalizeTTL(ttl)
    return this.withRevision(dbFile, (locks) => this.prepareCreate(user, dbFile, app, depth, options, ttl, locks))
  }

  async createOrRefresh(
    user: UserModel,
    dbFile: FileDBProps,
    app: LOCK_APP,
    depth: LOCK_DEPTH,
    ttl?: number
  ): Promise<[created: boolean, lock: FileLock]> {
    ttl = this.normalizeTTL(ttl)
    const outcome = await this.withRevision<[created: boolean, lock: FileLock] | LockConflict>(dbFile, (locks) => {
      const pathLocks = this.filterLocksByPath(dbFile, locks)
      if (pathLocks.length > 0) {
        const conflictLock = pathLocks.find((lock) => lock.owner.id !== user.id)
        if (conflictLock) return { result: new LockConflict(conflictLock, 'Conflicting lock'), mutations: [] }

        // Every reuse must create a new incarnation: an older operation may still hold a handle
        // and must not be able to delete the lock while this caller is using it.
        const refreshedLocks = pathLocks.map((lock) => this.refreshedLock(lock, ttl))
        return {
          result: [false, refreshedLocks[0]] as [created: boolean, lock: FileLock],
          mutations: refreshedLocks.map((lock, index) => this.setMutation(lock, ttl, 'present', pathLocks[index].lockId))
        }
      }

      const transition = this.prepareCreate(user, dbFile, app, depth, null, ttl, locks)
      return transition.result[0]
        ? transition
        : { result: new LockConflict(transition.result[1], 'Conflicting lock'), mutations: transition.mutations }
    })
    if (outcome instanceof LockConflict) throw outcome
    return outcome
  }

  async removeLock(dbFile: FileDBProps, lock: FileLock): Promise<boolean> {
    this.logger.verbose({ tag: this.removeLock.name, msg: `${lock.key}` })
    return this.removeLocks(dbFile, [lock])
  }

  async getLocksForRemoval(user: UserModel, dbFile: FileDBProps, includeChildren: boolean): Promise<FileLock[]> {
    const snapshot = await this.readConsistentSnapshot(dbFile)
    const locks = this.filterLocksByPath(dbFile, snapshot)
    if (includeChildren) {
      for (const lock of this.childLocks(dbFile, snapshot)) if (lock.dbFilePath !== dbFile.path) locks.push(lock)
    }
    for (const lock of locks) {
      if (user.id === lock.owner.id) continue
      const conflict = `cannot remove conflicting lock : ${dbFile.path} (${user.login}) -> ${lock.dbFilePath} (${lock.owner.login})`
      this.logger.debug({ tag: this.getLocksForRemoval.name, msg: conflict })
      throw new LockConflict(lock, conflict)
    }
    if (locks.length > CACHE_REVISION_MAX_MUTATIONS) {
      throw new RangeError(`Cannot atomically remove more than ${CACHE_REVISION_MAX_MUTATIONS} file locks`)
    }
    return locks
  }

  async removeLocks(dbFile: FileDBProps, capturedLocks: readonly FileLock[]): Promise<boolean> {
    const locks = [...new Map(capturedLocks.map((lock) => [lock.key, lock])).values()]
    if (locks.length > CACHE_REVISION_MAX_MUTATIONS) {
      throw new RangeError(`Cannot atomically remove more than ${CACHE_REVISION_MAX_MUTATIONS} file locks`)
    }
    if (!locks.length) return true

    const directMutations = locks.map((lock) => this.deleteMutation(lock))
    if (await this.commitKnownMutations(dbFile, directMutations)) return true

    // A stale handle must not prevent other captured incarnations from being cleaned up.
    // Fall back to a fresh snapshot and commit only the locks that still match.
    return this.withRevision(dbFile, (currentLocks) => {
      const currentLocksByKey = new Map(currentLocks.map((lock) => [lock.key, lock]))
      const mutations: CacheRevisionMutation[] = []
      let allCurrent = true
      for (const lock of locks) {
        const currentLock = currentLocksByKey.get(lock.key)
        if (!currentLock || currentLock.lockId !== lock.lockId) {
          allCurrent = false
          continue
        }
        mutations.push(this.deleteMutation(currentLock))
      }
      return { result: allCurrent, mutations }
    })
  }

  async isLockedWithToken(token: string, dbFile: FileDBProps): Promise<FileLock | null> {
    return this.getLockByToken(token, dbFile)
  }

  async browseParentChildLocks(dbFile: FileDBProps, includeRoot = true): Promise<Record<string, FileLock>> {
    const locks = await this.readConsistentSnapshot(dbFile)
    const childLocks: Record<string, FileLock> = includeRoot
      ? Object.fromEntries(this.filterLocksByPath(dbFile, locks).map((lock) => [fileName(lock.dbFilePath), lock]))
      : {}
    const lengthFilter = dbFile.path === '.' ? 1 : dbFile.path.split('/').length + 1
    for (const lock of this.childLocks(dbFile, locks)) {
      if (lengthFilter === lock.dbFilePath.split('/').length) {
        const dbFileName = fileName(lock.dbFilePath)
        if (!(dbFileName in childLocks)) childLocks[dbFileName] = lock
      }
    }
    return childLocks
  }

  async browseLocks(dbFile: FileDBProps): Promise<Record<string, FileLock>> {
    return Object.fromEntries((await this.getLocksByPath(dbFile)).map((lock) => [fileName(lock.dbFilePath), lock]))
  }

  async refreshLockTimeout(dbFile: FileDBProps, lock: FileLock, ttl?: number): Promise<boolean> {
    ttl = this.normalizeTTL(ttl)
    const refreshedLock = this.refreshedLock(lock, ttl)
    if (!(await this.commitKnownMutations(dbFile, [this.setMutation(refreshedLock, ttl, 'present', lock.lockId)]))) return false
    Object.assign(lock, refreshedLock)
    return true
  }

  async getLockByToken(token: string, dbFile: FileDBProps): Promise<FileLock | null> {
    const locks = await this.readConsistentSnapshot(dbFile, token)
    let inheritedLock: FileLock | null = null
    let inheritedDepth = -1
    for (const lock of locks) {
      if (lock.options?.lockToken !== token) continue
      if (lock.dbFilePath === dbFile.path) return lock
      if (!this.lockAppliesToPath(lock, dbFile.path)) continue
      const lockDepth = lock.dbFilePath === '.' ? 0 : lock.dbFilePath.split('/').length
      if (lockDepth <= inheritedDepth) continue
      inheritedLock = lock
      inheritedDepth = lockDepth
    }
    return inheritedLock
  }

  async getLocksByPath(dbFile: FileDBProps): Promise<FileLock[]> {
    return this.filterLocksByPath(dbFile, await this.readConsistentSnapshot(dbFile))
  }

  async isPathLocked(dbFile: FileDBProps): Promise<boolean> {
    return (await this.getLocksByPath(dbFile)).length > 0
  }

  async checkConflicts(
    dbFile: FileDBProps,
    depth: LOCK_DEPTH,
    options?: { userId?: number; app?: LOCK_APP; lockScope?: LOCK_SCOPE; lockTokens?: string[] }
  ): Promise<void> {
    this.checkSnapshotConflicts(dbFile, depth, await this.readConsistentSnapshot(dbFile), options)
  }

  convertLockToFileLockProps(lock: FileLock): FileLockProps
  convertLockToFileLockProps(lock: null): null
  convertLockToFileLockProps(lock: FileLock | null): FileLockProps | null {
    if (!lock) return null
    return {
      owner: lock.owner,
      app: lock.app,
      info: lock.options?.lockInfo,
      isExclusive: lock.options?.lockScope !== LOCK_SCOPE.SHARED
    }
  }

  genDAVToken(): string {
    return `${LOCK_PREFIX}${crypto.randomUUID()}`
  }

  private prepareCreate(
    user: UserModel,
    dbFile: FileDBProps,
    app: LOCK_APP,
    depth: LOCK_DEPTH,
    options: FileLockOptions | null | undefined,
    ttl: number,
    locks: readonly FileLock[]
  ): FileLockTransition<[succeeded: boolean, lock: FileLock]> {
    try {
      this.checkSnapshotConflicts(dbFile, depth, locks, { app, lockScope: options?.lockScope })
    } catch (e) {
      if (e instanceof LockConflict) return { result: [false, e.lock], mutations: [] }
      if (e instanceof Error) throw e
      throw new Error(toErrorMessage(e), { cause: e })
    }

    const key = this.genLockKey(dbFile, depth, options?.lockToken)
    const existingLock = locks.find((lock) => lock.key === key)
    if (existingLock) {
      const isSameSharedLock =
        options?.lockScope === LOCK_SCOPE.SHARED &&
        existingLock.options?.lockScope === LOCK_SCOPE.SHARED &&
        existingLock.options.lockToken === options.lockToken &&
        existingLock.app === app &&
        existingLock.dbFilePath === dbFile.path &&
        existingLock.depth === depth
      if (isSameSharedLock) {
        const refreshedLock = this.refreshedLock(existingLock, ttl)
        return { result: [true, refreshedLock], mutations: [this.setMutation(refreshedLock, ttl, 'present', existingLock.lockId)] }
      }
      return { result: [false, existingLock], mutations: [] }
    }

    const lock: FileLock = {
      lockId: crypto.randomUUID(),
      owner: user.asOwner(),
      dbFilePath: dbFile.path,
      key,
      app,
      depth,
      expiration: currentTimeStamp() + ttl,
      options: options ?? undefined
    }
    this.logger.verbose({ tag: this.create.name, msg: `${key}` })
    return { result: [true, lock], mutations: [this.setMutation(lock, ttl, 'absent')] }
  }

  private checkSnapshotConflicts(
    dbFile: FileDBProps,
    depth: LOCK_DEPTH,
    locks: readonly FileLock[],
    options?: { userId?: number; app?: LOCK_APP; lockScope?: LOCK_SCOPE; lockTokens?: string[] }
  ): void {
    for (const lock of this.parentLocks(dbFile, locks, { includeRoot: true, depth: DEPTH.INFINITY })) {
      if (this.isCompatibleLock(lock, options)) continue
      const conflict = `conflicting parent lock : ${dbFile.path} -> ${lock.dbFilePath} (${lock.owner.login})`
      this.logger.debug({ tag: this.checkConflicts.name, msg: `${conflict}` })
      throw new LockConflict(lock, conflict)
    }
    for (const lock of this.childLocks(dbFile, locks)) {
      if (lock.dbFilePath === dbFile.path || (depth === DEPTH.RESOURCE && dirName(lock.dbFilePath) !== dbFile.path)) continue
      if (this.isCompatibleLock(lock, options)) continue
      const conflict = `conflicting child lock : ${dbFile.path} -> ${lock.dbFilePath} (${lock.owner.login})`
      this.logger.debug({ tag: this.checkConflicts.name, msg: `${conflict}` })
      throw new LockConflict(lock, conflict)
    }
  }

  private *childLocks(dbFile: FileDBProps, locks: readonly FileLock[]): Generator<FileLock> {
    for (const lock of locks) {
      if (dbFile.path === '.' || lock.dbFilePath.startsWith(`${dbFile.path}/`)) yield lock
    }
  }

  private *parentLocks(
    dbFile: FileDBProps,
    locks: readonly FileLock[],
    options: { includeRoot?: boolean; depth?: LOCK_DEPTH } = {}
  ): Generator<FileLock> {
    let path = options.includeRoot ? dbFile.path : dirName(dbFile.path)
    const parentPath = dirName(dbFile.path)
    while (true) {
      const depth = options.depth && (dbFile.path === path || parentPath === path) ? null : options.depth
      for (const lock of locks) {
        if (lock.dbFilePath === path && (!depth || lock.depth === depth)) yield lock
      }
      if (path === '.') break
      path = dirName(path)
    }
  }

  private async readConsistentSnapshot(dbFile: FileDBProps, token?: string): Promise<FileLock[]> {
    return (await this.readSnapshot(dbFile, token)).locks
  }

  private async withRevision<T>(dbFile: FileDBProps, transition: (locks: readonly FileLock[]) => FileLockTransition<T>): Promise<T> {
    const revisionKey = this.getRevisionKey(dbFile)
    const deadline = performance.now() + this.revisionRetryTimeout
    const timeoutError = () => new Error(`Unable to coordinate file lock operation for ${dbFile.path}`)
    while (true) {
      const attempt = await this.enqueueNamespace(revisionKey, deadline, timeoutError, async () => {
        const snapshot = await this.readSnapshot(dbFile)
        const transitionResult = transition(snapshot.locks)
        const committed =
          !transitionResult.mutations.length ||
          (await this.cache.commitRevision({ revisionKey, expectedRevision: snapshot.revision, mutations: transitionResult.mutations }))
        return { committed, result: transitionResult.result }
      })
      if (attempt.committed) return attempt.result
      if (!(await this.waitForRetry(deadline))) throw timeoutError()
    }
  }

  private async commitKnownMutations(dbFile: FileDBProps, mutations: readonly CacheRevisionMutation[]): Promise<boolean> {
    const revisionKey = this.getRevisionKey(dbFile)
    const deadline = performance.now() + this.revisionRetryTimeout
    return this.enqueueNamespace(
      revisionKey,
      deadline,
      () => new Error(`Unable to coordinate file lock operation for ${dbFile.path}`),
      () => this.cache.mutateRevision({ revisionKey, mutations })
    )
  }

  private async readSnapshot(dbFile: FileDBProps, token?: string): Promise<{ revision: string | null; locks: FileLock[] }> {
    const snapshot = await this.cache.readRevisionSnapshot({
      revisionKey: this.getRevisionKey(dbFile),
      pattern: this.getLockPattern(dbFile, token)
    })
    return { revision: snapshot.revision, locks: this.parseSnapshotLocks(snapshot) }
  }

  private parseSnapshotLocks(snapshot: CacheRevisionSnapshot): FileLock[] {
    const locks: FileLock[] = []
    for (const { key, value } of snapshot.entries) {
      if (value && typeof value === 'object' && (value as FileLock).key === key) locks.push(value as FileLock)
    }
    return locks
  }

  private getLockPattern(dbFile: FileDBProps, token?: string): string {
    const prefix = [CACHE_LOCK_PREFIX, this.getNamespaceSegment(dbFile), ...this.getScopeSegments(dbFile)].join('|')
    return token === undefined ? `${prefix}|*` : `${prefix}|*|token:${token}`
  }

  private async enqueueNamespace<T>(revisionKey: string, deadline: number, timeoutError: () => Error, operation: () => Promise<T>): Promise<T> {
    await this.acquireNamespace(revisionKey, deadline, timeoutError)
    try {
      if (performance.now() >= deadline) throw timeoutError()
      return await operation()
    } finally {
      this.releaseNamespace(revisionKey)
    }
  }

  private acquireNamespace(revisionKey: string, deadline: number, timeoutError: () => Error): Promise<void> {
    const remaining = deadline - performance.now()
    if (remaining <= 0) return Promise.reject(timeoutError())

    const queue = this.namespaceQueues.get(revisionKey)
    if (!queue) {
      this.namespaceQueues.set(revisionKey, new Set())
      return Promise.resolve()
    }

    return new Promise<void>((resolve, reject) => {
      // Set preserves FIFO insertion order; timed-out waiters remove themselves even if the active holder never returns.
      const waiter: FileLockNamespaceQueueWaiter = {
        deadline,
        timeout: setTimeout(() => {
          if (!queue.delete(waiter)) return
          waiter.reject()
        }, remaining),
        resolve,
        reject: () => reject(timeoutError())
      }
      queue.add(waiter)
    })
  }

  private releaseNamespace(revisionKey: string): void {
    const queue = this.namespaceQueues.get(revisionKey)
    if (!queue) return

    for (const waiter of queue) {
      queue.delete(waiter)
      clearTimeout(waiter.timeout)
      if (performance.now() >= waiter.deadline) {
        waiter.reject()
        continue
      }
      waiter.resolve()
      return
    }
    this.namespaceQueues.delete(revisionKey)
  }

  private async waitForRetry(deadline: number): Promise<boolean> {
    const remaining = deadline - performance.now()
    if (remaining <= 0) return false
    await sleep(Math.min(remaining, this.revisionRetryDelay + Math.floor(Math.random() * this.revisionRetryJitter)))
    return performance.now() < deadline
  }

  private setMutation(lock: FileLock, ttl: number, expect: 'absent' | 'present', expectedLockId = lock.lockId): CacheRevisionMutation {
    if (expect === 'absent') return { type: 'set', key: lock.key, value: lock, ttl, expect: 'absent' }
    return { type: 'set', key: lock.key, value: lock, ttl, expect: 'present', expectedLockId }
  }

  private deleteMutation(lock: FileLock): CacheRevisionMutation {
    return { type: 'delete', key: lock.key, expect: 'present', expectedLockId: lock.lockId }
  }

  private refreshedLock(lock: FileLock, ttl: number): FileLock {
    // A refresh creates a new incarnation so cleanup holding the previous handle cannot delete it.
    return { ...lock, lockId: crypto.randomUUID(), expiration: currentTimeStamp() + ttl }
  }

  private normalizeTTL(ttl?: number): number {
    const normalizedTTL = typeof ttl === 'number' ? Math.ceil(ttl) : Number.NaN
    return Number.isSafeInteger(normalizedTTL) && normalizedTTL > 0 ? normalizedTTL : CACHE_LOCK_DEFAULT_TTL
  }

  private filterLocksByPath(dbFile: FileDBProps, locks: readonly FileLock[]): FileLock[] {
    return locks.filter((lock) => lock.dbFilePath === dbFile.path)
  }

  private lockAppliesToPath(lock: FileLock, path: string): boolean {
    if (path === lock.dbFilePath) return true
    return lock.depth === DEPTH.INFINITY ? lock.dbFilePath === '.' || path.startsWith(`${lock.dbFilePath}/`) : dirName(path) === lock.dbFilePath
  }

  private isCompatibleLock(lock: FileLock, options?: { userId?: number; app?: LOCK_APP; lockScope?: LOCK_SCOPE; lockTokens?: string[] }): boolean {
    if (options?.lockScope === LOCK_SCOPE.SHARED && lock.options?.lockScope === LOCK_SCOPE.SHARED && options.app === lock.app) return true
    return options?.userId === lock.owner.id && (!lock.options || !!options?.lockTokens?.includes(lock.options.lockToken as string))
  }

  private getRevisionKey(dbFile: FileDBProps): string {
    // A primary registry keeps one revision while explicit scope segments isolate its storage roots.
    return `${CACHE_LOCK_REVISION_PREFIX}|${this.getNamespaceSegment(dbFile)}`
  }

  private genLockKey(dbFile: FileDBProps, depth: LOCK_DEPTH, token?: string | null): string {
    const segments = [CACHE_LOCK_PREFIX, this.getNamespaceSegment(dbFile), ...this.getScopeSegments(dbFile), `path:${dbFile.path}`, `depth:${depth}`]
    if (token) segments.push(`token:${token}`)
    return segments.join('|')
  }

  private getNamespaceSegment(dbFile: FileDBProps): string {
    if (dbFile.ownerId != null) return `ownerId:${dbFile.ownerId}`
    if (dbFile.spaceId != null) return `spaceId:${dbFile.spaceId}`
    if (dbFile.shareExternalId != null) return `shareExternalId:${dbFile.shareExternalId}`
    throw new Error(`Unable to identify the file lock namespace for ${dbFile.path}`)
  }

  private getScopeSegments(dbFile: FileDBProps): string[] {
    const namespaceProperty = dbFile.ownerId != null ? files.ownerId.name : dbFile.spaceId != null ? files.spaceId.name : files.shareExternalId.name
    const scopeSegments = (Object.keys(dbFile) as (keyof FileDBProps)[])
      .filter((key) => key !== namespaceProperty && key !== files.inTrash.name && key !== files.path.name && dbFile[key] != null)
      .sort()
      .map((key) => `${key}:${dbFile[key]}`)
    // An explicit marker prevents a native-space prefix from matching its external-root keys.
    return scopeSegments.length > 0 ? scopeSegments : [CACHE_LOCK_NATIVE_SCOPE_SEGMENT]
  }
}
