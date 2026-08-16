import { Inject, Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression, Interval, Timeout } from '@nestjs/schedule'
import { isNotNull, sql } from 'drizzle-orm'
import { unionAll } from 'drizzle-orm/mysql-core'
import fs from 'node:fs/promises'
import path from 'node:path'
import { currentTimeStamp } from '../../../common/shared'
import { configuration } from '../../../configuration/config.environment'
import { Cache } from '../../../infrastructure/cache/cache.service'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants'
import { DBSchema } from '../../../infrastructure/database/interfaces/database.interface'
import { getTablesWithFileIdColumn } from '../../../infrastructure/database/utils'
import { SharesQueries } from '../../shares/services/shares-queries.service'
import { SpaceModel } from '../../spaces/models/space.model'
import { SpacesQueries } from '../../spaces/services/spaces-queries.service'
import { USER_ROLE } from '../../users/constants/user'
import { UserModel } from '../../users/models/user.model'
import { users } from '../../users/schemas/users.schema'
import { CACHE_TASK_CANCEL_PREFIX, CACHE_TASK_PREFIX, CACHE_TASK_TTL, CACHE_TASK_USER_PREFIX } from '../constants/cache'
import { TEMPORARY_FILE_PREFIX, TEMPORARY_PATH } from '../constants/files'
import { FileTask, FileTaskStatus } from '../models/file-task'
import { filesRecents } from '../schemas/files-recents.schema'
import { files } from '../schemas/files.schema'
import { isPathExists, removeFiles, temporaryFilePrefix } from '../utils/files'
import { isActiveTaskStatus } from '../utils/tasks'
import { FilesContentIndexer } from './files-content-indexer.service'
import { FilesTasksManager } from './tasks/files-tasks-manager.service'
import { FilesQuotaManager } from './files-quota-manager.service'
import { FilesTrashRetention } from './files-trash-retention.service'

interface TemporaryDirectory {
  includeLegacyEntries: boolean
  path: string
}

interface TemporaryDirectorySnapshot {
  fileNames: string[]
  path: string
}

type TemporaryDirectoriesByUser = Map<number, Map<string, TemporaryDirectory>>

@Injectable()
export class FilesScheduler {
  private readonly TMP_FILE_MAX_AGE = 86_400_000 // one day

  private readonly logger = new Logger(FilesScheduler.name)
  private isQuotaUpdateIsRunning = false
  private isQuotaUpdateEntriesIsRunning = false
  private isTrashCleanupRunning = false

  constructor(
    @Inject(DB_TOKEN_PROVIDER) private readonly db: DBSchema,
    private readonly cache: Cache,
    private readonly filesContentIndexer: FilesContentIndexer,
    private readonly filesQuotaManager: FilesQuotaManager,
    private readonly filesTrashRetention: FilesTrashRetention,
    private readonly spacesQueries: SpacesQueries,
    private readonly sharesQueries: SharesQueries
  ) {}

  @Timeout(5_000)
  async onStartup(): Promise<void> {
    try {
      await this.resetContentIndexingState()
      await this.cleanupInterruptedTasks()
      await this.cleanupUserTmpFiles()
      await this.clearRecentFiles()
      await this.updateQuotas()
      await this.cleanupTrashFiles()
    } catch (e) {
      this.logger.error({ tag: this.onStartup.name, msg: `${e}` })
    }
  }

  @Timeout(300_000)
  async afterStartup(): Promise<void> {
    try {
      await this.indexContentFiles()
    } catch (e) {
      this.logger.error({ tag: this.afterStartup.name, msg: `${e}` })
    }
  }

  @Interval(60_000)
  async updateStorageAndIndexing() {
    if (this.isQuotaUpdateIsRunning || this.isQuotaUpdateEntriesIsRunning) return
    this.isQuotaUpdateEntriesIsRunning = true
    try {
      await this.filesQuotaManager.updateStorageUsageEntries()
    } catch (e) {
      this.logger.error({ tag: this.updateStorageAndIndexing.name, msg: `update quota error: ${e}` })
    } finally {
      this.isQuotaUpdateEntriesIsRunning = false
    }
    if (!this.filesContentIndexer.isEnabled || (await this.filesContentIndexer.isRunning())) return
    try {
      await this.filesContentIndexer.processIndexingQueue()
    } catch (e) {
      this.logger.error({ tag: this.updateStorageAndIndexing.name, msg: `update indexing error: ${e}` })
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupTrashFiles() {
    if (this.isTrashCleanupRunning) return
    this.isTrashCleanupRunning = true
    try {
      await this.filesTrashRetention.indexAndCleanTrash()
    } catch (e) {
      this.logger.error({ tag: this.cleanupTrashFiles.name, msg: `${e}` })
    } finally {
      this.isTrashCleanupRunning = false
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupUserTmpFiles(): Promise<void> {
    this.logger.log({ tag: this.cleanupUserTmpFiles.name, msg: `START` })
    const expiration = Date.now() - this.TMP_FILE_MAX_AGE
    const temporaryDirectories: TemporaryDirectoriesByUser = new Map()
    try {
      const appUsers = await this.db
        .select({
          id: users.id,
          login: users.login,
          role: users.role
        })
        .from(users)

      for (const user of appUsers) {
        const homeTmpPath = user.role === USER_ROLE.LINK ? UserModel.getLinkTmpPath(user.id) : UserModel.getTmpPath(user.login)
        this.registerTemporaryDirectory(temporaryDirectories, user.id, homeTmpPath, true)
        if (user.role !== USER_ROLE.LINK) {
          await this.discoverTemporaryUsersRoot(
            path.join(UserModel.getHomePath(user.login), TEMPORARY_PATH.STORAGE, TEMPORARY_PATH.ACTORS),
            temporaryDirectories
          )
        }
      }

      if (await isPathExists(configuration.applications.files.spacesPath)) {
        for (const entry of await fs.readdir(configuration.applications.files.spacesPath, { withFileTypes: true })) {
          if (entry.isDirectory()) {
            await this.discoverTemporaryUsersRoot(SpaceModel.getUsersTmpPath(entry.name), temporaryDirectories)
          }
        }
      }

      const externalRoots = new Set<string>()
      for (const space of await this.spacesQueries.spacesQuotaPaths()) {
        for (const externalPath of space.externalPaths || []) {
          if (typeof externalPath === 'string' && externalPath) externalRoots.add(path.resolve(externalPath))
        }
      }
      for (const share of await this.sharesQueries.sharesQuotaExternalPaths()) {
        if (typeof share.externalPath === 'string' && share.externalPath) externalRoots.add(path.resolve(share.externalPath))
      }
      for (const externalRoot of externalRoots) {
        await this.discoverTemporaryUsersRoot(path.join(externalRoot, TEMPORARY_PATH.STORAGE, TEMPORARY_PATH.ACTORS), temporaryDirectories)
      }
    } catch (e) {
      this.logger.error({ tag: this.cleanupUserTmpFiles.name, msg: `${e}` })
    }
    for (const [userId, directories] of temporaryDirectories) {
      await this.cleanupTemporaryDirectories(userId, [...directories.values()], expiration)
    }
    this.logger.log({ tag: this.cleanupUserTmpFiles.name, msg: `END` })
  }

  @Cron(CronExpression.EVERY_8_HOURS)
  async clearRecentFiles(): Promise<void> {
    const keepNumber = 100
    let nbCleared = 0
    try {
      for (const fk of [filesRecents.ownerId, filesRecents.spaceId, filesRecents.shareId]) {
        const [r] = await this.db.execute(sql`
          DELETE
          FROM ${filesRecents}
          WHERE ${fk} IS NOT NULL
            AND (${fk}, ${filesRecents.id}) NOT IN (SELECT repositoryId, id
                           FROM (SELECT ${fk} AS repositoryId,
                                        id,
                                        ROW_NUMBER() OVER (PARTITION BY ${fk} ORDER BY ${filesRecents.mtime} DESC) AS rn
                                 FROM ${filesRecents}
                                 WHERE ${fk} IS NOT NULL) AS ranked
                           WHERE ranked.rn <= ${keepNumber})
        `)
        nbCleared += r.affectedRows
      }
    } catch (e) {
      this.logger.error({ tag: this.clearRecentFiles.name, msg: `${e}` })
    }
    this.logger.log({ tag: this.clearRecentFiles.name, msg: `${nbCleared} records cleared` })
  }

  @Cron(CronExpression.EVERY_4_HOURS)
  async indexContentFiles(): Promise<void> {
    // queue a full content indexing request, it will be consumed by the minute scheduler
    if (await this.filesContentIndexer.requestFullIndexing()) {
      this.logger.verbose({ tag: this.indexContentFiles.name, msg: 'full indexing requested' })
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  // Remove files that are no longer referenced by any relation.
  async deleteOrphanFiles() {
    this.logger.log({ tag: this.deleteOrphanFiles.name, msg: `START` })
    const selects: any[] = []
    for (const table of getTablesWithFileIdColumn()) {
      selects.push(this.db.selectDistinct({ id: table.fileId }).from(table).where(isNotNull(table.fileId)))
    }
    if (selects.length === 0) {
      this.logger.warn({ tag: this.deleteOrphanFiles.name, msg: `no tables with fileId column` })
      return
    }
    const unionSub = (selects.length === 1 ? selects[0] : unionAll(...(selects as [any, any, ...any[]]))).as('u')
    // Debug
    // const [preview] = (await this.db.execute(sql`
    //   SELECT f.id
    //   FROM ${files} AS f
    //   LEFT JOIN ${unionSub} ON ${unionSub.id} = f.id
    //   WHERE ${unionSub.id} IS NULL
    // `)) as any[]
    // console.log(preview.length, preview)
    const deleteQuery = sql`
      DELETE f
      FROM ${files} AS f
      LEFT JOIN ${unionSub} ON ${unionSub.id} = f.id
      WHERE ${unionSub.id} IS NULL
    `
    try {
      await this.db.transaction(async (tx) => {
        const [r] = await tx.execute(deleteQuery)
        this.logger.log({ tag: this.deleteOrphanFiles.name, msg: `files: ${r.affectedRows}` })
      })
    } catch (e) {
      this.logger.log({ tag: this.deleteOrphanFiles.name, msg: `${e}` })
    }
    this.logger.log({ tag: this.deleteOrphanFiles.name, msg: `END` })
  }

  @Cron(CronExpression.EVERY_HOUR)
  async updateQuotas() {
    if (this.isQuotaUpdateIsRunning) return
    this.isQuotaUpdateIsRunning = true
    this.logger.log({ tag: this.updateQuotas.name, msg: 'Personals - START' })
    try {
      await this.filesQuotaManager.updatePersonalSpacesQuota()
    } catch (e) {
      this.logger.error({ tag: this.updateQuotas.name, msg: `Personals - ${e}` })
    }
    this.logger.log({ tag: this.updateQuotas.name, msg: 'Personals - END' })
    this.logger.log({ tag: this.updateQuotas.name, msg: 'Spaces - START' })
    try {
      await this.filesQuotaManager.updateSpacesQuota()
    } catch (e) {
      this.logger.error({ tag: this.updateQuotas.name, msg: `Spaces - ${e}` })
    }
    this.logger.log({ tag: this.updateQuotas.name, msg: 'Spaces - END' })
    this.logger.log({ tag: this.updateQuotas.name, msg: 'Share External Paths - START' })
    try {
      await this.filesQuotaManager.updateSharesExternalPathQuota()
    } catch (e) {
      this.logger.error({ tag: this.updateQuotas.name, msg: `Share External Paths - ${e}` })
    }
    this.logger.log({ tag: this.updateQuotas.name, msg: 'Share External Paths - END' })
    this.isQuotaUpdateIsRunning = false
  }

  private registerTemporaryDirectory(
    temporaryDirectories: TemporaryDirectoriesByUser,
    userId: number,
    temporaryPath: string,
    includeLegacyEntries = false
  ): void {
    let userDirectories = temporaryDirectories.get(userId)
    if (!userDirectories) {
      userDirectories = new Map()
      temporaryDirectories.set(userId, userDirectories)
    }
    const existingDirectory = userDirectories.get(temporaryPath)
    userDirectories.set(temporaryPath, {
      path: temporaryPath,
      includeLegacyEntries: includeLegacyEntries || existingDirectory?.includeLegacyEntries === true
    })
  }

  private async discoverTemporaryUsersRoot(usersTmpPath: string, temporaryDirectories: TemporaryDirectoriesByUser): Promise<void> {
    try {
      if (!(await isPathExists(usersTmpPath))) return
      for (const entry of await fs.readdir(usersTmpPath, { withFileTypes: true })) {
        const userId = Number(entry.name)
        if (!entry.isDirectory() || !Number.isSafeInteger(userId) || userId <= 0) continue
        this.registerTemporaryDirectory(temporaryDirectories, userId, path.join(usersTmpPath, entry.name))
      }
    } catch (e) {
      this.logger.error({ tag: this.cleanupUserTmpFiles.name, msg: `unable to browse ${usersTmpPath} : ${e}` })
    }
  }

  private async snapshotTemporaryDirectory(directory: TemporaryDirectory): Promise<TemporaryDirectorySnapshot | undefined> {
    try {
      if (!(await isPathExists(directory.path))) return
      const fileNames = await fs.readdir(directory.path)
      const candidates = directory.includeLegacyEntries ? fileNames : fileNames.filter((fileName) => fileName.startsWith(TEMPORARY_FILE_PREFIX))
      return candidates.length === 0 ? undefined : { fileNames: candidates, path: directory.path }
    } catch (e) {
      this.logger.error({ tag: this.cleanupUserTmpFiles.name, msg: `unable to browse ${directory.path} : ${e}` })
    }
  }

  private async cleanupTemporaryDirectories(userId: number, directories: TemporaryDirectory[], expiration: number): Promise<void> {
    const snapshots: TemporaryDirectorySnapshot[] = []
    for (const directory of directories) {
      const snapshot = await this.snapshotTemporaryDirectory(directory)
      if (snapshot) snapshots.push(snapshot)
    }
    if (snapshots.length === 0) return

    let protectedPrefixes: string[]
    try {
      // Tasks are stored before their staging entries are created. Reading the cache after all
      // snapshots guarantees that concurrent entries are either protected or left for the next pass.
      protectedPrefixes = await this.taskPrefixes(userId)
    } catch (e) {
      this.logger.error({ tag: this.cleanupUserTmpFiles.name, msg: `unable to resolve temporary files for user ${userId} : ${e}` })
      return
    }
    for (const snapshot of snapshots) {
      for (const fileName of snapshot.fileNames) {
        if (protectedPrefixes.some((prefix) => fileName.startsWith(prefix))) continue
        await this.removeTmpFile(path.join(snapshot.path, fileName), expiration)
      }
    }
  }

  private async taskPrefixes(userId: number): Promise<string[]> {
    const keys = await this.cache.keys(FilesTasksManager.getCacheKey(userId))
    const tasks: (FileTask | null | undefined)[] = keys.length ? await this.cache.mget(keys) : []
    return tasks.filter((task): task is FileTask => Boolean(task?.id && task?.type)).map((task) => temporaryFilePrefix(task.type, task.id))
  }

  private async removeTmpFile(rPath: string, expiration?: number): Promise<void> {
    try {
      if (expiration === undefined || (await fs.lstat(rPath)).mtimeMs < expiration) {
        await removeFiles(rPath)
      }
    } catch (e) {
      this.logger.error({ tag: this.cleanupUserTmpFiles.name, msg: `unable to remove ${rPath} : ${e}` })
    }
  }

  private async cleanupInterruptedTasks(): Promise<void> {
    try {
      let nb = 0
      let nbCancellationRequests = 0
      let nbUserTaskCounters = 0
      // The in-memory queue and abort watchers are lost on process restart; cached active tasks cannot be resumed safely.
      const keys = await this.cache.keys(`${CACHE_TASK_PREFIX}-*`)
      for (const key of keys) {
        if (key.startsWith(`${CACHE_TASK_CANCEL_PREFIX}-`)) {
          // Cancellation requests only target live abort watchers, so they are stale after startup.
          await this.cache.del(key)
          nbCancellationRequests++
          continue
        }
        if (key.startsWith(`${CACHE_TASK_USER_PREFIX}-`)) {
          // Running counters are runtime state; keeping them would block new tasks from claiming slots.
          await this.cache.del(key)
          nbUserTaskCounters++
          continue
        }
        const task = await this.cache.get(key)
        if (task && isActiveTaskStatus(task.status)) {
          // Do not requeue filesystem operations here: they are not guaranteed to be idempotent.
          task.status = FileTaskStatus.ERROR
          task.result = 'Interrupted'
          task.endedAt = currentTimeStamp(null, true)
          nb++
          await this.cache.set(key, task, CACHE_TASK_TTL)
        }
      }
      this.logger.log({
        tag: this.cleanupInterruptedTasks.name,
        msg: `${nb} tasks cleaned, ${nbCancellationRequests} cancellation requests cleared, ${nbUserTaskCounters} user task counters cleared`
      })
    } catch (e) {
      this.logger.error({ tag: this.cleanupInterruptedTasks.name, msg: `${e}` })
    }
  }

  private async resetContentIndexingState(): Promise<void> {
    await this.filesContentIndexer.resetIndexingRuntimeState()
    this.logger.log({ tag: this.resetContentIndexingState.name, msg: `done` })
  }
}
