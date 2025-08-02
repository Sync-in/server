/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Injectable, Logger } from '@nestjs/common'
import crypto from 'node:crypto'

import { currentTimeStamp } from '../../../common/shared'
import { Cache } from '../../../infrastructure/cache/services/cache.service'
import { UserModel } from '../../users/models/user.model'
import { DEPTH, LOCK_DEPTH, LOCK_PREFIX, LOCK_SCOPE } from '../../webdav/constants/webdav'
import { WebDAVLock } from '../../webdav/interfaces/webdav.interface'
import { CACHE_LOCK_PREFIX } from '../constants/cache'
import { FileDBProps } from '../interfaces/file-db-props.interface'
import { FileLock } from '../interfaces/file-lock.interface'
import { LockConflict } from '../models/file-lock-error'
import { files } from '../schemas/files.schema'
import { dirName, fileName } from '../utils/files'

@Injectable()
export class FilesLockManager {
  /* Philosophy
  Currently this manager only handle conflicting locks between multiple users, not between clients
  - The locks created from api
      * They do not contain a token key or a davLock property
      * They are exclusive only
      * They must have a depth of 'infinity' (all children) or '0' (root and root members)
  - The locks created from WebDAV or OnlyOffice are stored with a token and a davLock property
      * They must have a depth of 'infinity' (all children) or '0' (root and root members)
      * They can be exclusive (WebDAV) or shared (OnlyOffice)
      * If created with WebDAV, they are stored with a token and a davLock property
      * If created with OnlyOffice, they are stored with no token and a davLock property whose `locktoken` & `lockroot` properties are null
  Cache token key format = `flock|token?:${uuid}|path:${path}|ownerId?:${number}|spaceId?:${number}|...props` => FileLock
  */
  public static readonly defaultLockTimeoutSeconds = 86400 // 1 day
  private readonly logger = new Logger(FilesLockManager.name)

  constructor(private readonly cache: Cache) {}

  async create(user: UserModel, dbFile: FileDBProps, depth: LOCK_DEPTH, ttl?: number, davLock?: WebDAVLock): Promise<[boolean, FileLock]> {
    let token: string
    let lockscope: LOCK_SCOPE
    if (davLock) {
      // webdav context
      davLock.locktoken = this.genDAVToken()
      token = davLock.locktoken
      lockscope = davLock.lockscope
    } else {
      // api context
      token = null
      lockscope = null
    }
    try {
      await this.checkConflicts(dbFile, depth, { lockScope: lockscope })
    } catch (e) {
      if (e instanceof LockConflict) {
        return [false, e.lock]
      }
      throw new Error(e)
    }
    ttl ??= FilesLockManager.defaultLockTimeoutSeconds
    const key = `${CACHE_LOCK_PREFIX}|${this.genSuffixKey(dbFile, { depth: depth, token: token })}`
    const expiration = Math.floor(currentTimeStamp() + ttl)
    const lock: FileLock = {
      owner: user.asOwner(),
      dbFilePath: dbFile.path,
      key: key,
      depth: depth,
      expiration: expiration,
      davLock: davLock
    }
    this.logger.verbose(`${this.create.name} - ${key}`)
    await this.cache.set(key, lock, ttl)
    return [true, lock]
  }

  removeLock(key: string): Promise<boolean> {
    this.logger.verbose(`${this.removeLock.name} - ${key}`)
    return this.cache.del(key)
  }

  async removeChildLocks(user: UserModel, dbFile: FileDBProps) {
    const ownedLockKeys: string[] = []
    for await (const lock of this.searchChildLocks(dbFile)) {
      if (user.id === lock.owner.id) {
        ownedLockKeys.push(lock.key)
        continue
      }
      const conflict = `cannot remove conflicting child lock : ${dbFile.path} (${user.login}) -> ${lock.dbFilePath} (${lock.owner.login})`
      this.logger.debug(`${this.removeChildLocks.name} - ${conflict}`)
      throw new LockConflict(lock, conflict)
    }
    for (const key of ownedLockKeys) {
      this.logger.verbose(`${this.removeChildLocks.name} - child locks: ${key}`)
      await this.removeLock(key)
    }
  }

  async isLockedWithToken(token: string, dbFilePath: string): Promise<FileLock> {
    // check if url (or any of its parents) is locked by the token
    const lock = await this.getLockByToken(token)
    return lock ? (dbFilePath.startsWith(lock.dbFilePath) ? lock : null) : null
  }

  async browseParentChildLocks(dbFile: FileDBProps, includeRoot = true): Promise<Record<string, FileLock>> {
    // find child locks inside the path
    const childLocks: Record<string, FileLock> = includeRoot ? await this.browseLocks(dbFile) : {}
    const lengthFilter = dbFile.path === '.' ? 1 : dbFile.path.split('/').length + 1
    for await (const lock of this.searchChildLocks(dbFile)) {
      // filter child locks on length
      if (lengthFilter === lock.dbFilePath.split('/').length) {
        // !!! locks with shared scope can have the same file name, in this case we only keep the first entry
        const dbFileName = fileName(lock.dbFilePath)
        if (!(dbFileName in childLocks)) {
          childLocks[fileName(lock.dbFilePath)] = lock
        }
      }
    }
    return childLocks
  }

  async browseLocks(dbFile: FileDBProps): Promise<Record<string, FileLock>> {
    return Object.fromEntries((await this.getLocksByPath(dbFile)).map((l) => [fileName(l.dbFilePath), l]))
  }

  async refreshLockTimeout(lock: FileLock, ttl: number) {
    lock.expiration = currentTimeStamp() + ttl
    this.cache.set(lock.key, lock, ttl).catch((e: Error) => this.logger.error(`${this.refreshLockTimeout.name} - ${e}`))
  }

  async getLockByToken(token: string): Promise<FileLock> {
    const key = await this.searchKeyByToken(token)
    return key ? (await this.cache.get(key)) || null : null
  }

  async getLocksByPath(dbFile: FileDBProps): Promise<FileLock[]> {
    if (dbFile.path !== '.') {
      const props = this.genSuffixKey(dbFile, { ignorePath: true })
      const keys = await this.searchKeysByPath(dbFile.path, props)
      if (keys.length) {
        return (await this.cache.mget(keys)).filter(Boolean)
      }
    }
    return []
  }

  async isPathLocked(dbFile: FileDBProps): Promise<boolean> {
    if (dbFile.path !== '.') return false
    const props = this.genSuffixKey(dbFile, { ignorePath: true })
    return !!(await this.searchKeysByPath(dbFile.path, props)).length
  }

  async checkConflicts(
    dbFile: FileDBProps,
    depth: LOCK_DEPTH,
    options?: { userId?: number; lockScope?: LOCK_SCOPE; lockTokens?: string[] }
  ): Promise<void> {
    /* Checks if a file could be modified, created, moved, or deleted
       Throws an `LockConflict` error when there are parent locks (depth: 0) or child locks (depth: infinite) that prevent modifications
       Returns on the first conflict (compliant with the RFC 4918)
    */
    for await (const l of this.searchParentLocks(dbFile, { includeRoot: true, depth: DEPTH.INFINITY })) {
      if (options?.lockScope && options?.lockScope === LOCK_SCOPE.SHARED && l.davLock.lockscope === LOCK_SCOPE.SHARED) {
        // Only compatible with shared locks (even by same owner)
        continue
      }
      if (options?.userId === l.owner.id && (!l.davLock || (options?.lockTokens?.length && options.lockTokens.indexOf(l.davLock.locktoken) > -1))) {
        // Owner owns this lock (no davLock if the lock was created from api)
        continue
      }
      const conflict = `conflicting parent lock : ${dbFile.path} -> ${l.dbFilePath} (${l.owner.login})`
      this.logger.debug(`${this.checkConflicts.name} - ${conflict}`)
      throw new LockConflict(l, conflict)
    }
    if (depth === DEPTH.INFINITY) {
      for await (const l of this.searchChildLocks(dbFile)) {
        if (options?.userId === l.owner.id && (!l.davLock || (options?.lockTokens?.length && options.lockTokens.indexOf(l.davLock.locktoken) > -1))) {
          // Owner owns this lock (no davLock if the lock was created from api)
          continue
        }
        const conflict = `conflicting child lock : ${dbFile.path} -> ${l.dbFilePath} (${l.owner.login})`
        this.logger.debug(`${this.checkConflicts.name} - ${conflict}`)
        throw new LockConflict(l, conflict)
      }
    }
  }

  private async *searchParentLocks(dbFile: FileDBProps, options: { includeRoot?: boolean; depth?: LOCK_DEPTH } = {}): AsyncGenerator<FileLock> {
    const props = this.genSuffixKey(dbFile, { ignorePath: true })
    let path = dbFile.path
    const parentPath = dirName(path)
    this.logger.verbose(`${this.searchParentLocks.name} - (including root : ${options.includeRoot}) : ${path} (${props})`)
    if (!options.includeRoot) {
      path = dirName(path)
    }
    while (path !== '.') {
      // Even if the depth is "infinite", the path and the parent path could be locked with depth "0"
      const depth = options.depth && (dbFile.path === path || parentPath === path) ? null : options.depth
      const keys = await this.searchKeysByPath(path, props, depth)
      if (keys.length) {
        for (const l of (await this.cache.mget(keys)).filter(Boolean) as FileLock[]) {
          this.logger.verbose(`-> ${l.dbFilePath}`)
          yield l
        }
      }
      path = dirName(path)
    }
  }

  async *searchChildLocks(dbFile: FileDBProps) {
    const props = this.genSuffixKey(dbFile, { ignorePath: true })
    const path = dbFile.path === '.' ? '*' : `${dbFile.path}/*`
    this.logger.verbose(`${this.searchChildLocks.name} - ${path} (${props})`)
    const keys = await this.searchKeysByPath(path, props)
    if (keys.length) {
      for (const l of (await this.cache.mget(keys)).filter(Boolean) as FileLock[]) {
        this.logger.verbose(`-> ${l.dbFilePath} (owner: ${l.owner.login})`)
        yield l
      }
    }
  }

  private async searchKeyByToken(token: string): Promise<string> {
    const keys = await this.cache.keys(`${CACHE_LOCK_PREFIX}|token:${token}|*`)
    if (!keys.length) {
      return null
    } else if (keys.length > 1) {
      this.logger.warn(`Several keys found for token : ${token} => ${JSON.stringify(keys)}`)
    }
    return keys[0]
  }

  private searchKeysByPath(path: string, props = '*', depth?: LOCK_DEPTH): Promise<string[]> {
    return this.cache.keys(`${CACHE_LOCK_PREFIX}*${depth ? `|depth:${depth}` : ''}|path:${path}|${props}`)
  }

  private genDAVToken(): string {
    return `${LOCK_PREFIX}${crypto.randomUUID()}`
  }

  private genSuffixKey(dbFile: FileDBProps, options: { ignorePath?: boolean; depth?: LOCK_DEPTH; token?: string } = {}): string {
    // return -> `depth:infinity|path:code/sync-in|spaceId:1` | `token:xxx|depth:0|path:code/sync-in.ts|ownerId:1`
    // ignorePath -> `spaceId:1`
    const suffixes = []
    for (const k of Object.keys(dbFile)
      .filter((k) => k !== files.inTrash.name && dbFile[k] !== null)
      .sort()) {
      if (k === files.path.name) {
        if (options.ignorePath) {
          continue
        }
        suffixes.unshift(`${k}:${dbFile[k]}`)
      } else {
        suffixes.push(`${k}:${dbFile[k]}`)
      }
    }
    if (options.depth) suffixes.unshift(`depth:${options.depth}`)
    if (options.token) suffixes.unshift(`token:${options.token}`)
    return suffixes.join('|')
  }
}
