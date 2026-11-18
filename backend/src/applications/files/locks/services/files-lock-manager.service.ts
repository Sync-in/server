import { Injectable, Logger } from '@nestjs/common'
import crypto from 'node:crypto'

import { toErrorMessage } from '../../../../common/errors.js'
import { sleep } from '../../../../common/functions.js'
import { currentTimeStamp } from '../../../../common/shared.js'
import { Cache } from '../../../../infrastructure/cache/cache.service.js'
import type { UserModel } from '../../../users/models/user.model.js'
import type { LOCK_DEPTH } from '../../../webdav/constants/webdav.js'
import { LOCK_PREFIX, LOCK_SCOPE } from '../../../webdav/constants/webdav.js'
import { CACHE_LOCK_DEFAULT_TTL, CACHE_LOCK_NATIVE_SCOPE_SEGMENT, CACHE_LOCK_PREFIX, CACHE_LOCK_STATE_MAX_LOCKS } from '../../core/constants/cache.js'
import type { FileDBProps } from '../../core/interfaces/file-db-props.interface.js'
import type {
  FileLock,
  FileLockCleanup,
  FileLockCleanupOptions,
  FileLockConflictOptions,
  FileLockDiscovery,
  FileLockOptions,
  FileLocksByName,
  FileLockState,
  FileLockStateView,
  FileLockTransition,
  LOCK_APP
} from '../interfaces/file-lock.interface.js'
import type { FileLockProps } from '../../core/interfaces/file-props.interface.js'
import { LockConflict } from '../models/file-lock-error.js'
import { files } from '../../core/schemas/files.schema.js'
import { fileName, filePathIdentity } from '../../core/utils/files.js'

@Injectable()
export class FilesLockManager {
  /*
  Philosophy

  Locks are coordinated on their exact storage resource. Depth remains protocol
  metadata and part of a logical lock identity; it does not make a lock conflict
  with parents or descendants.

  - API/internal locks have no options or token and are exclusive by default.
    The explicit API lock endpoint refreshes locks owned by the same user and
    conflicts with locks owned by another user.
  - Protocol/editor locks carry FileLockOptions:
    * WebDAV locks have a generated token, a URI lockRoot, and can be exclusive
      or shared.
    * OnlyOffice and Euro-Office locks are shared, with a null token and lockRoot.
    * Collabora Online locks are shared, with a client token and a null lockRoot.
  - Compatible shared locks from the same application can coexist when their
    tokens differ. A tokenless shared logical lock is reused and refreshed.

  Physical cache state key:
  `flock|<primary-namespace>|<storage-scope>|path:<unicode-caseless-path>`
    => `{ version, locks: FileLock[] }`

  Logical FileLock.key:
  `<state-key>|depth:<depth>[|token:<token>]`

  One physical cache entry stores the version and every live logical lock for an
  exact resource. Parent and child resources never share a CAS key.
  */
  private readonly logger = new Logger(FilesLockManager.name)
  private readonly stateRetryTimeout = 2_000
  private readonly stateRetryDelay = 10
  private readonly stateRetryJitter = 20
  private readonly stateTtlSafetyMargin = 1

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
    return this.withState(dbFile, (locks) => this.prepareCreate(user, dbFile, app, depth, options, ttl, locks), true)
  }

  async createOrRefresh(
    user: UserModel,
    dbFile: FileDBProps,
    app: LOCK_APP,
    depth: LOCK_DEPTH,
    ttl?: number
  ): Promise<[created: boolean, lock: FileLock]> {
    ttl = this.normalizeTTL(ttl)
    const outcome = await this.withState<[created: boolean, lock: FileLock] | LockConflict>(dbFile, (locks) => {
      if (locks.length > 0) {
        const conflictLock = locks.find((lock) => lock.owner.id !== user.id)
        if (conflictLock) return { result: new LockConflict(conflictLock, 'Conflicting lock') }

        const refreshedLocks = locks.map((lock) => this.refreshedLock(lock, ttl))
        return {
          result: [false, refreshedLocks[0]] as [created: boolean, lock: FileLock],
          nextLocks: refreshedLocks
        }
      }

      const transition = this.prepareCreate(user, dbFile, app, depth, null, ttl, locks)
      return transition.result[0] ? transition : { result: new LockConflict(transition.result[1], 'Conflicting lock') }
    })
    if (outcome instanceof LockConflict) throw outcome
    return outcome
  }

  async removeLock(dbFile: FileDBProps, lock: FileLock): Promise<boolean> {
    this.logger.verbose({ tag: this.removeLock.name, msg: `${lock.key}` })
    return this.removeLocks(dbFile, [lock])
  }

  async removeLockByToken(dbFile: FileDBProps, token: string, ownerId?: number): Promise<[succeeded: boolean, lock: FileLock | null]> {
    let capturedLock: FileLock | null | undefined
    const result = await this.withState<[succeeded: boolean, lock: FileLock | null]>(dbFile, (locks) => {
      if (capturedLock === undefined) {
        capturedLock = locks.find((lock) => lock.options?.lockToken === token) ?? null
      }
      if (!capturedLock || (ownerId !== undefined && capturedLock.owner.id !== ownerId)) {
        return { result: [false, capturedLock] }
      }

      const currentLock = locks.find((lock) => lock.key === capturedLock!.key && lock.lockId === capturedLock!.lockId)
      if (!currentLock) return { result: [false, capturedLock] }
      return {
        result: [true, currentLock],
        nextLocks: locks.filter((lock) => lock.key !== currentLock.key || lock.lockId !== currentLock.lockId)
      }
    })
    if (result[0]) this.logger.verbose({ tag: this.removeLockByToken.name, msg: `${result[1]!.key}` })
    return result
  }

  // Capture lock incarnations before filesystem I/O. The returned cleanup only
  // removes those incarnations, so concurrent refreshes or replacements survive.
  async prepareCleanup(user: UserModel, dbFile: FileDBProps, options: FileLockCleanupOptions): Promise<FileLockCleanup> {
    const exactLocks = options.includeExact ? await this.getLocksForRemoval(user, dbFile) : []
    let descendantLocks: FileLock[] = []
    if (options.includeDescendants) {
      try {
        descendantLocks = await this.getDescendantLocksForCleanup(dbFile)
      } catch (e) {
        this.logger.warn({
          tag: this.prepareCleanup.name,
          msg: `Unable to capture descendant locks for cleanup of ${dbFile.path}: ${toErrorMessage(e)}`
        })
      }
    }
    return { remove: () => this.removeCapturedLocks(dbFile, exactLocks, descendantLocks) }
  }

  async isLockedWithToken(token: string, dbFile: FileDBProps): Promise<FileLock | null> {
    return this.getLockByToken(token, dbFile)
  }

  async browseParentChildLocks(dbFile: FileDBProps): Promise<FileLockDiscovery> {
    const locks = await this.readLocks(this.getScopeStatePattern(dbFile))
    const lengthFilter = dbFile.path === '.' ? 1 : dbFile.path.split('/').length + 1
    return {
      root: locks.filter((lock) => this.isSamePath(lock.dbFilePath, dbFile.path)),
      children: this.groupLocksByName(
        locks.filter((lock) => this.isDescendantPath(dbFile.path, lock.dbFilePath) && lengthFilter === lock.dbFilePath.split('/').length)
      )
    }
  }

  async browseLocks(dbFile: FileDBProps): Promise<FileLock[]> {
    return this.getLocksByPath(dbFile)
  }

  async refreshLockTimeout(dbFile: FileDBProps, lock: FileLock, ttl?: number): Promise<boolean> {
    if (!this.isSamePath(lock.dbFilePath, dbFile.path)) return false
    ttl = this.normalizeTTL(ttl)
    const refreshedLock = await this.withState<FileLock | null>(dbFile, (locks) => {
      const currentLock = locks.find((candidate) => candidate.key === lock.key && candidate.lockId === lock.lockId)
      if (!currentLock) return { result: null }
      const refreshed = this.refreshedLock(currentLock, ttl)
      return { result: refreshed, nextLocks: this.replaceLock(locks, currentLock, refreshed) }
    })
    if (!refreshedLock) return false
    Object.assign(lock, refreshedLock)
    return true
  }

  async refreshLockByToken(dbFile: FileDBProps, token: string, ttl?: number, ownerId?: number): Promise<[succeeded: boolean, lock: FileLock | null]> {
    ttl = this.normalizeTTL(ttl)
    let capturedLock: FileLock | null | undefined
    return this.withState<[succeeded: boolean, lock: FileLock | null]>(dbFile, (locks) => {
      if (capturedLock === undefined) {
        capturedLock = locks.find((lock) => lock.options?.lockToken === token) ?? null
      }
      if (!capturedLock || (ownerId !== undefined && capturedLock.owner.id !== ownerId)) {
        return { result: [false, capturedLock] }
      }

      const currentLock = locks.find((lock) => lock.key === capturedLock!.key && lock.lockId === capturedLock!.lockId)
      if (!currentLock) return { result: [false, capturedLock] }
      const refreshedLock = this.refreshedLock(currentLock, ttl)
      return { result: [true, refreshedLock], nextLocks: this.replaceLock(locks, currentLock, refreshedLock) }
    })
  }

  async getLockByToken(token: string, dbFile: FileDBProps): Promise<FileLock | null> {
    return (await this.getLocksByPath(dbFile)).find((lock) => lock.options?.lockToken === token) ?? null
  }

  async getLocksByPath(dbFile: FileDBProps): Promise<FileLock[]> {
    return (await this.readState(dbFile)).locks
  }

  async isPathLocked(dbFile: FileDBProps): Promise<boolean> {
    return (await this.getLocksByPath(dbFile)).length > 0
  }

  isSameLockResource(firstDbFile: FileDBProps, secondDbFile: FileDBProps): boolean {
    return this.getStateKey(firstDbFile) === this.getStateKey(secondDbFile)
  }

  async checkConflicts(dbFile: FileDBProps, _depth: LOCK_DEPTH, options?: FileLockConflictOptions): Promise<void> {
    this.checkStateConflicts(dbFile, (await this.readState(dbFile)).locks, options)
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

  private async getLocksForRemoval(user: UserModel, dbFile: FileDBProps): Promise<FileLock[]> {
    const locks = await this.getLocksByPath(dbFile)
    for (const lock of locks) {
      if (user.id === lock.owner.id) continue
      const conflict = `cannot remove conflicting lock : ${dbFile.path} (${user.login}) -> ${lock.dbFilePath} (${lock.owner.login})`
      this.logger.debug({ tag: this.getLocksForRemoval.name, msg: conflict })
      throw new LockConflict(lock, conflict)
    }
    return locks
  }

  private async getDescendantLocksForCleanup(dbFile: FileDBProps): Promise<FileLock[]> {
    return (await this.readLocks(this.getDescendantStatePattern(dbFile))).filter((lock) => this.isDescendantPath(dbFile.path, lock.dbFilePath))
  }

  private async removeLocks(dbFile: FileDBProps, capturedLocks: readonly FileLock[]): Promise<boolean> {
    const locks = [...new Map(capturedLocks.map((lock) => [lock.key, lock])).values()]
    if (!locks.length) return true
    if (locks.some((lock) => !this.isSamePath(lock.dbFilePath, dbFile.path))) return false

    // Skip stale handles but still remove every captured incarnation that remains current.
    // The result reports whether all captured locks were still current.
    return this.withState(dbFile, (currentLocks) => {
      const currentLocksByKey = new Map(currentLocks.map((lock) => [lock.key, lock]))
      const capturedKeys = new Set<string>()
      let allCurrent = true
      for (const lock of locks) {
        const currentLock = currentLocksByKey.get(lock.key)
        if (!currentLock || currentLock.lockId !== lock.lockId) {
          allCurrent = false
          continue
        }
        capturedKeys.add(lock.key)
      }
      return {
        result: allCurrent,
        ...(capturedKeys.size ? { nextLocks: currentLocks.filter((lock) => !capturedKeys.has(lock.key)) } : {})
      }
    })
  }

  private async removeCapturedLocks(dbFile: FileDBProps, exactLocks: readonly FileLock[], descendantLocks: readonly FileLock[]): Promise<void> {
    if (exactLocks.length) {
      try {
        if (!(await this.removeLocks(dbFile, exactLocks))) {
          this.logger.warn({ tag: this.removeCapturedLocks.name, msg: `Some locks changed while cleaning ${dbFile.path}` })
        }
      } catch (e) {
        this.logger.error({ tag: this.removeCapturedLocks.name, msg: toErrorMessage(e) })
      }
    }

    // Each resource owns an independent CAS state, so descendants are cleaned path by path.
    const locksByPath = new Map<string, FileLock[]>()
    for (const lock of descendantLocks) {
      const pathIdentity = filePathIdentity(lock.dbFilePath)
      const locks = locksByPath.get(pathIdentity)
      if (locks) locks.push(lock)
      else locksByPath.set(pathIdentity, [lock])
    }
    for (const locks of locksByPath.values()) {
      const dbFilePath = locks[0].dbFilePath
      try {
        if (!(await this.removeLocks({ ...dbFile, path: dbFilePath }, locks))) {
          this.logger.warn({ tag: this.removeCapturedLocks.name, msg: `Some descendant locks changed while cleaning ${dbFile.path}: ${dbFilePath}` })
        }
      } catch (e) {
        this.logger.warn({
          tag: this.removeCapturedLocks.name,
          msg: `Unable to clean descendant locks of ${dbFile.path}: ${dbFilePath}: ${toErrorMessage(e)}`
        })
      }
    }
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
      this.checkStateConflicts(dbFile, locks, { app, lockScope: options?.lockScope })
    } catch (e) {
      if (e instanceof LockConflict) return { result: [false, e.lock] }
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
        this.isSamePath(existingLock.dbFilePath, dbFile.path) &&
        existingLock.depth === depth
      if (isSameSharedLock) {
        const refreshedLock = this.refreshedLock(existingLock, ttl)
        return { result: [true, refreshedLock], nextLocks: this.replaceLock(locks, existingLock, refreshedLock) }
      }
      return { result: [false, existingLock] }
    }

    if (locks.length >= CACHE_LOCK_STATE_MAX_LOCKS) {
      throw new RangeError(`Cannot store more than ${CACHE_LOCK_STATE_MAX_LOCKS} locks for ${dbFile.path}`)
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
    return { result: [true, lock], nextLocks: [...locks, lock] }
  }

  private checkStateConflicts(dbFile: FileDBProps, locks: readonly FileLock[], options?: FileLockConflictOptions): void {
    for (const lock of locks) {
      if (this.isCompatibleLock(lock, options)) continue
      const conflict = `conflicting lock : ${dbFile.path} (${lock.owner.login})`
      this.logger.debug({ tag: this.checkConflicts.name, msg: `${conflict}` })
      throw new LockConflict(lock, conflict)
    }
  }

  // Re-read and recompute the transition after every CAS miss; a transition built
  // from stale state is never replayed against a newer version.
  private async withState<T>(
    dbFile: FileDBProps,
    transition: (locks: readonly FileLock[]) => FileLockTransition<T>,
    tryAbsentStateFirst = false
  ): Promise<T> {
    const key = this.getStateKey(dbFile)
    const deadline = performance.now() + this.stateRetryTimeout
    if (tryAbsentStateFirst) {
      // The common first-lock path can commit from an empty state without a preliminary cache read.
      const transitionResult = transition([])
      if (transitionResult.nextLocks === undefined) return transitionResult.result
      if (await this.compareAndSwapState(key, null, transitionResult.nextLocks)) return transitionResult.result
    }

    while (true) {
      const state = await this.readState(dbFile)
      const transitionResult = transition(state.locks)
      if (transitionResult.nextLocks === undefined) return transitionResult.result
      if (await this.compareAndSwapState(key, state.version, transitionResult.nextLocks)) return transitionResult.result
      if (!(await this.waitForRetry(deadline))) throw new Error(`Unable to coordinate file lock operation for ${dbFile.path}`)
    }
  }

  private async compareAndSwapState(key: string, expectedVersion: string | null, locks: readonly FileLock[]): Promise<boolean> {
    const nextLocks = locks.filter((lock) => lock.expiration > currentTimeStamp())
    return this.cache.compareAndSwap(
      nextLocks.length
        ? {
            key,
            expectedVersion,
            value: { version: crypto.randomUUID(), locks: nextLocks } satisfies FileLockState,
            ttl: this.getStateTTL(nextLocks)
          }
        : { key, expectedVersion }
    )
  }

  private async readState(dbFile: FileDBProps): Promise<FileLockStateView> {
    const key = this.getStateKey(dbFile)
    const state = this.parseState(await this.cache.get(key), key)
    return {
      version: state?.version ?? null,
      locks: state ? this.activeLocks(state.locks).filter((lock) => this.isSamePath(lock.dbFilePath, dbFile.path)) : []
    }
  }

  // Pattern reads are non-transactional and only serve discovery or best-effort
  // cleanup; mutations revalidate each exact resource through its own CAS.
  private async readLocks(pattern: string): Promise<FileLock[]> {
    const keys = await this.cache.keys(pattern)
    if (!keys.length) return []
    const values = await this.cache.mget(keys)
    const locks: FileLock[] = []
    for (let index = 0; index < keys.length; index++) {
      const state = this.parseState(values[index], keys[index])
      if (state) locks.push(...this.activeLocks(state.locks))
    }
    return locks
  }

  private parseState(value: unknown, key: string): FileLockState | null {
    if (value === undefined) return null
    if (
      !value ||
      typeof value !== 'object' ||
      typeof (value as FileLockState).version !== 'string' ||
      !Array.isArray((value as FileLockState).locks)
    ) {
      throw new Error(`Invalid file lock state for ${key}`)
    }
    return value as FileLockState
  }

  private activeLocks(locks: readonly FileLock[]): FileLock[] {
    const now = currentTimeStamp()
    return locks.filter((lock) => lock.expiration > now)
  }

  private getStateTTL(locks: readonly FileLock[]): number {
    // Keep the state alive through its latest lock; the margin covers expiration rounding.
    const maxExpiration = Math.max(...locks.map((lock) => lock.expiration))
    const remaining = Math.ceil(maxExpiration - currentTimeStamp())
    if (!Number.isSafeInteger(remaining)) throw new RangeError('Invalid file lock state TTL')
    return Math.max(1, remaining) + this.stateTtlSafetyMargin
  }

  private replaceLock(locks: readonly FileLock[], currentLock: FileLock, replacement: FileLock): FileLock[] {
    return locks.map((lock) => (lock.key === currentLock.key && lock.lockId === currentLock.lockId ? replacement : lock))
  }

  private getStatePrefix(dbFile: FileDBProps): string {
    return [CACHE_LOCK_PREFIX, this.getNamespaceSegment(dbFile), ...this.getScopeSegments(dbFile)].join('|')
  }

  private getScopeStatePattern(dbFile: FileDBProps): string {
    return `${this.getStatePrefix(dbFile)}|path:*`
  }

  private getDescendantStatePattern(dbFile: FileDBProps): string {
    const prefix = this.getStatePrefix(dbFile)
    const pathIdentity = filePathIdentity(dbFile.path)
    return pathIdentity === '.' ? `${prefix}|path:*` : `${prefix}|path:${pathIdentity}/*`
  }

  private async waitForRetry(deadline: number): Promise<boolean> {
    const remaining = deadline - performance.now()
    if (remaining <= 0) return false
    await sleep(Math.min(remaining, this.stateRetryDelay + Math.floor(Math.random() * this.stateRetryJitter)))
    return performance.now() < deadline
  }

  private refreshedLock(lock: FileLock, ttl: number): FileLock {
    // A refresh creates a new incarnation so cleanup holding the previous handle cannot delete it.
    return { ...lock, lockId: crypto.randomUUID(), expiration: currentTimeStamp() + ttl }
  }

  private normalizeTTL(ttl?: number): number {
    const normalizedTTL = typeof ttl === 'number' ? Math.ceil(ttl) : Number.NaN
    return Number.isSafeInteger(normalizedTTL) && normalizedTTL > 0 ? normalizedTTL : CACHE_LOCK_DEFAULT_TTL
  }

  private isDescendantPath(parentPath: string, candidatePath: string): boolean {
    const parentPathIdentity = filePathIdentity(parentPath)
    const candidatePathIdentity = filePathIdentity(candidatePath)
    return candidatePathIdentity !== parentPathIdentity && (parentPathIdentity === '.' || candidatePathIdentity.startsWith(`${parentPathIdentity}/`))
  }

  private isSamePath(firstPath: string, secondPath: string): boolean {
    return filePathIdentity(firstPath) === filePathIdentity(secondPath)
  }

  private groupLocksByName(locks: FileLock[]): FileLocksByName {
    const locksByName = Object.create(null) as FileLocksByName
    for (const lock of locks) (locksByName[filePathIdentity(fileName(lock.dbFilePath))] ??= []).push(lock)
    return locksByName
  }

  private isCompatibleLock(lock: FileLock, options?: FileLockConflictOptions): boolean {
    if (options?.lockScope === LOCK_SCOPE.SHARED && lock.options?.lockScope === LOCK_SCOPE.SHARED && options.app === lock.app) return true
    return options?.userId === lock.owner.id && (!lock.options || !!options?.lockTokens?.includes(lock.options.lockToken as string))
  }

  private getStateKey(dbFile: FileDBProps): string {
    return `${this.getStatePrefix(dbFile)}|path:${filePathIdentity(dbFile.path)}`
  }

  private genLockKey(dbFile: FileDBProps, depth: LOCK_DEPTH, token?: string | null): string {
    const segments = [this.getStateKey(dbFile), `depth:${depth}`]
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
    const storageScopeSegments = (Object.keys(dbFile) as (keyof FileDBProps)[])
      .filter((key) => key !== namespaceProperty && key !== files.inTrash.name && key !== files.path.name && dbFile[key] != null)
      .sort()
      .map((key) => `${key}:${dbFile[key]}`)
    return storageScopeSegments.length > 0 ? storageScopeSegments : [CACHE_LOCK_NATIVE_SCOPE_SEGMENT]
  }
}
