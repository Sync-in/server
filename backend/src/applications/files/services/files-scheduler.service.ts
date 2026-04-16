import { Inject, Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression, Interval, Timeout } from '@nestjs/schedule'
import { isNotNull, sql } from 'drizzle-orm'
import { unionAll } from 'drizzle-orm/mysql-core'
import fs from 'node:fs/promises'
import path from 'node:path'
import { configuration } from '../../../configuration/config.environment'
import { Cache } from '../../../infrastructure/cache/services/cache.service'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants'
import { DBSchema } from '../../../infrastructure/database/interfaces/database.interface'
import { getTablesWithFileIdColumn } from '../../../infrastructure/database/utils'
import { USER_ROLE } from '../../users/constants/user'
import { UserModel } from '../../users/models/user.model'
import { users } from '../../users/schemas/users.schema'
import { CACHE_TASK_PREFIX } from '../constants/cache'
import { FileTask, FileTaskStatus } from '../models/file-task'
import { filesRecents } from '../schemas/files-recents.schema'
import { files } from '../schemas/files.schema'
import { dirHasChildren, isPathExists, removeFiles } from '../utils/files'
import { FilesContentIndexer } from './files-content-indexer.service'
import { FilesTasksManager } from './files-tasks-manager.service'
import { FilesQuotaManager } from './files-quota-manager.service'

@Injectable()
export class FilesScheduler {
  private readonly logger = new Logger(FilesScheduler.name)
  private isQuotaUpdateIsRunning = false
  private isQuotaUpdateEntriesIsRunning = false
  private pendingFullSync = false

  constructor(
    @Inject(DB_TOKEN_PROVIDER) private readonly db: DBSchema,
    private readonly cache: Cache,
    private readonly filesContentIndexer: FilesContentIndexer,
    private readonly filesQuotaManager: FilesQuotaManager
  ) {}

  @Timeout(10_000)
  async onStartup(): Promise<void> {
    try {
      await this.filesContentIndexer.resetRunningState()
      await this.cleanupInterruptedTasks()
      await this.clearRecentFiles()
      await this.updateQuotas()
    } catch (e) {
      this.logger.error(e)
    }
  }

  @Timeout(300_000)
  async afterStartup(): Promise<void> {
    try {
      await this.indexContentFiles()
    } catch (e) {
      this.logger.error(e)
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
    if (!configuration.applications.files.contentIndexing.enabled || (await this.filesContentIndexer.isRunning())) return
    try {
      await this.filesContentIndexer.updateIndexEntries()
    } catch (e) {
      this.logger.error({ tag: this.updateStorageAndIndexing.name, msg: `update indexing error: ${e}` })
    }
    if (this.pendingFullSync) {
      await this.indexContentFiles()
    }
  }

  async cleanupInterruptedTasks(): Promise<void> {
    this.logger.log({ tag: this.cleanupInterruptedTasks.name, msg: `START` })
    try {
      let nb = 0
      const keys = await this.cache.keys(`${CACHE_TASK_PREFIX}-*`)
      for (const key of keys) {
        const task = await this.cache.get(key)
        if (task && task.status === FileTaskStatus.PENDING) {
          task.status = FileTaskStatus.ERROR
          task.result = 'Interrupted'
          nb++
          this.cache.set(key, task).catch((e: Error) => this.logger.error({ tag: this.cleanupInterruptedTasks.name, msg: `${e}` }))
        }
      }
      this.logger.log({ tag: this.cleanupInterruptedTasks.name, msg: `${nb} tasks cleaned : END` })
    } catch (e) {
      this.logger.error({ tag: this.cleanupInterruptedTasks.name, msg: `${e}` })
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupUserTaskFiles(): Promise<void> {
    this.logger.log({ tag: this.cleanupUserTaskFiles.name, msg: `START` })
    try {
      for (const user of await this.db
        .select({
          id: users.id,
          login: users.login,
          role: users.role
        })
        .from(users)) {
        const userTasksPath = UserModel.getTasksPath(user.login, user.role === USER_ROLE.GUEST, user.role === USER_ROLE.LINK)
        if (!(await isPathExists(userTasksPath))) {
          continue
        }
        if (await dirHasChildren(userTasksPath, false)) {
          const cacheKey = FilesTasksManager.getCacheKey(user.id)
          const keys = await this.cache.keys(cacheKey)
          const excludeFiles = (await this.cache.mget(keys))
            .filter((task: FileTask) => task && task.status === FileTaskStatus.PENDING && task.props.compressInDirectory === false)
            .map((task: FileTask) => task.name)
          for (const f of (await fs.readdir(userTasksPath)).filter((f: string) => excludeFiles.indexOf(f) === -1)) {
            try {
              removeFiles(path.join(userTasksPath, f)).catch((e: Error) => this.logger.error({ tag: this.cleanupUserTaskFiles.name, msg: `${e}` }))
            } catch (e) {
              this.logger.error({ tag: this.cleanupUserTaskFiles.name, msg: `unable to remove ${path.join(userTasksPath, f)} : ${e}` })
            }
          }
        }
      }
    } catch (e) {
      this.logger.error({ tag: this.cleanupUserTaskFiles.name, msg: `${e}` })
    }
    this.logger.log({ tag: this.cleanupUserTaskFiles.name, msg: `END` })
  }

  @Cron(CronExpression.EVERY_8_HOURS)
  async clearRecentFiles(): Promise<void> {
    this.logger.log({ tag: this.clearRecentFiles.name, msg: `START` })
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
    this.logger.log({ tag: this.clearRecentFiles.name, msg: `${nbCleared} records cleared - END` })
  }

  @Cron(CronExpression.EVERY_4_HOURS)
  async indexContentFiles(): Promise<void> {
    // Conditional loading of file content indexing
    if (!configuration.applications.files.contentIndexing.enabled) return
    if (await this.filesContentIndexer.isRunning()) {
      this.pendingFullSync = true
      this.logger.warn({ tag: this.indexContentFiles.name, msg: `SKIP (already running) - deferred` })
      return
    }
    this.pendingFullSync = false
    this.logger.log({ tag: this.indexContentFiles.name, msg: `START` })
    await this.filesContentIndexer.parseAndIndexAllFiles()
    this.logger.log({ tag: this.indexContentFiles.name, msg: `END` })
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
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
}
