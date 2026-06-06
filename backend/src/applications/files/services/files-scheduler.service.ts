import { Inject, Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression, Interval, Timeout } from '@nestjs/schedule'
import { isNotNull, sql } from 'drizzle-orm'
import { unionAll } from 'drizzle-orm/mysql-core'
import fs from 'node:fs/promises'
import path from 'node:path'
import { currentTimeStamp } from '../../../common/shared'
import { Cache } from '../../../infrastructure/cache/cache.service'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants'
import { DBSchema } from '../../../infrastructure/database/interfaces/database.interface'
import { getTablesWithFileIdColumn } from '../../../infrastructure/database/utils'
import { USER_PATH, USER_ROLE } from '../../users/constants/user'
import { UserModel } from '../../users/models/user.model'
import { users } from '../../users/schemas/users.schema'
import { CACHE_TASK_CANCEL_PREFIX, CACHE_TASK_PREFIX, CACHE_TASK_USER_PREFIX } from '../constants/cache'
import { FileTask, FileTaskStatus } from '../models/file-task'
import { filesRecents } from '../schemas/files-recents.schema'
import { files } from '../schemas/files.schema'
import { isPathExists, removeFiles } from '../utils/files'
import { taskTemporaryPrefix } from '../utils/tasks'
import { FilesContentIndexer } from './files-content-indexer.service'
import { FilesTasksManager } from './files-tasks-manager.service'
import { FilesQuotaManager } from './files-quota-manager.service'
import { FilesTrashRetention } from './files-trash-retention.service'

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
    private readonly filesTrashRetention: FilesTrashRetention
  ) {}

  @Timeout(10_000)
  async onStartup(): Promise<void> {
    try {
      await this.resetContentIndexingState()
      await this.cleanupInterruptedTasks()
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
    try {
      const expiration = Date.now() - this.TMP_FILE_MAX_AGE
      for (const user of await this.db
        .select({
          id: users.id,
          login: users.login,
          role: users.role
        })
        .from(users)) {
        await this.cleanupUserTmpFilesForUser(user, expiration)
      }
    } catch (e) {
      this.logger.error({ tag: this.cleanupUserTmpFiles.name, msg: `${e}` })
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
            AND id NOT IN (SELECT id
                           FROM (SELECT id,
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
      this.logger.log({ tag: this.indexContentFiles.name, msg: 'REQUESTED' })
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

  private async cleanupUserTaskFiles(userId: number, userTasksPath: string, expiration: number): Promise<void> {
    try {
      const keys = await this.cache.keys(FilesTasksManager.getCacheKey(userId))
      const tasks: (FileTask | null | undefined)[] = keys.length ? await this.cache.mget(keys) : []
      const protectedFiles = new Set<string>()
      const protectedPrefixes: string[] = []
      for (const task of tasks) {
        if (!task || !this.isActiveTaskStatus(task.status)) continue
        // QUEUED tasks are included because they may start after this cache snapshot.
        protectedPrefixes.push(taskTemporaryPrefix(FilesTasksManager.getCacheKey(userId, task.id)))
        // Exported archives are final results stored beside staging entries and do not use the task prefix.
        if (task.props.compressInDirectory === false) protectedFiles.add(task.name)
      }
      for (const fileName of await fs.readdir(userTasksPath)) {
        if (protectedFiles.has(fileName) || protectedPrefixes.some((prefix: string) => fileName.startsWith(prefix))) continue
        // The age guard protects tasks created after the cache snapshot from being removed by this cleanup pass.
        await this.removeTmpFile(path.join(userTasksPath, fileName), expiration)
      }
    } catch (e) {
      this.logger.error({ tag: this.cleanupUserTaskFiles.name, msg: `unable to browse ${userTasksPath} : ${e}` })
    }
  }

  private async cleanupUserTmpFilesForUser(user: { id: number; login: string; role: number }, expiration: number): Promise<void> {
    const userTmpPath = UserModel.getTmpPath(user.login, user.role === USER_ROLE.GUEST, user.role === USER_ROLE.LINK)
    try {
      if (!(await isPathExists(userTmpPath))) {
        return
      }
      for (const f of await fs.readdir(userTmpPath)) {
        const rPath = path.join(userTmpPath, f)
        if (f === USER_PATH.TASKS) {
          await this.cleanupUserTaskFiles(user.id, rPath, expiration)
        } else {
          await this.removeTmpFile(rPath, expiration)
        }
      }
    } catch (e) {
      this.logger.error({ tag: this.cleanupUserTmpFiles.name, msg: `unable to browse ${userTmpPath} : ${e}` })
    }
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
      const keys = await this.cache.keys(`${CACHE_TASK_PREFIX}-*`)
      for (const key of keys) {
        if (key.startsWith(`${CACHE_TASK_CANCEL_PREFIX}-`)) {
          await this.cache.del(key)
          nbCancellationRequests++
          continue
        }
        if (key.startsWith(`${CACHE_TASK_USER_PREFIX}-`)) {
          await this.cache.del(key)
          nbUserTaskCounters++
          continue
        }
        const task = await this.cache.get(key)
        if (task && this.isActiveTaskStatus(task.status)) {
          task.status = FileTaskStatus.ERROR
          task.result = 'Interrupted'
          task.endedAt = currentTimeStamp(null, true)
          nb++
          this.cache.set(key, task).catch((e: Error) => this.logger.error({ tag: this.cleanupInterruptedTasks.name, msg: `${e}` }))
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

  private isActiveTaskStatus(status: FileTaskStatus): boolean {
    return status === FileTaskStatus.PENDING || status === FileTaskStatus.QUEUED
  }

  private async resetContentIndexingState(): Promise<void> {
    await this.filesContentIndexer.resetIndexingRuntimeState()
    this.logger.log({ tag: this.resetContentIndexingState.name, msg: `done` })
  }
}
