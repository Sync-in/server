/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Inject, Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression, Timeout } from '@nestjs/schedule'
import { sql } from 'drizzle-orm'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Cache } from '../../../infrastructure/cache/services/cache.service'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants'
import { DBSchema } from '../../../infrastructure/database/interfaces/database.interface'
import { USER_ROLE } from '../../users/constants/user'
import { UserModel } from '../../users/models/user.model'
import { users } from '../../users/schemas/users.schema'
import { CACHE_TASK_PREFIX } from '../constants/cache'
import { FileTask, FileTaskStatus } from '../models/file-task'
import { filesRecents } from '../schemas/files-recents.schema'
import { dirHasChildren, isPathExists, removeFiles } from '../utils/files'
import { FilesContentManager } from './files-content-manager.service'
import { FilesTasksManager } from './files-tasks-manager.service'

@Injectable()
export class FilesScheduler {
  private readonly logger = new Logger(FilesScheduler.name)

  constructor(
    @Inject(DB_TOKEN_PROVIDER) private readonly db: DBSchema,
    private readonly cache: Cache,
    private readonly filesContentManager: FilesContentManager
  ) {}

  @Timeout(30000)
  async cleanupInterruptedTasks(): Promise<void> {
    this.logger.log(`${this.cleanupInterruptedTasks.name} - START`)
    try {
      let nb = 0
      const keys = await this.cache.keys(`${CACHE_TASK_PREFIX}-*`)
      for (const key of keys) {
        const task = await this.cache.get(key)
        if (task && task.status === FileTaskStatus.PENDING) {
          task.status = FileTaskStatus.ERROR
          task.result = 'Interrupted'
          nb++
          this.cache.set(key, task).catch((e: Error) => this.logger.error(`${this.cleanupInterruptedTasks.name} - ${e}`))
        }
      }
      this.logger.log(`${this.cleanupInterruptedTasks.name} - ${nb} tasks cleaned : END`)
    } catch (e) {
      this.logger.error(`${this.cleanupInterruptedTasks.name} - ${e}`)
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupUserTaskFiles(): Promise<void> {
    this.logger.log(`${this.cleanupUserTaskFiles.name} - START`)
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
              removeFiles(path.join(userTasksPath, f)).catch((e: Error) => this.logger.error(`${this.cleanupUserTaskFiles.name} - ${e}`))
            } catch (e) {
              this.logger.error(`${this.cleanupUserTaskFiles.name} - unable to remove ${path.join(userTasksPath, f)} : ${e}`)
            }
          }
        }
      }
    } catch (e) {
      this.logger.error(`${this.cleanupUserTaskFiles.name} - ${e}`)
    }
    this.logger.log(`${this.cleanupUserTaskFiles.name} - END`)
  }

  @Timeout(30000)
  @Cron(CronExpression.EVERY_8_HOURS)
  async clearRecentFiles(): Promise<void> {
    this.logger.log(`${this.clearRecentFiles.name} - START`)
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
                                        ROW_NUMBER() OVER (PARTITION BY ${fk} ORDER BY ${filesRecents.mtime}) AS rn
                                 FROM ${filesRecents}
                                 WHERE ${fk} IS NOT NULL) AS ranked
                           WHERE ranked.rn <= ${keepNumber})
        `)
        nbCleared += r.affectedRows
      }
    } catch (e) {
      this.logger.error(`${this.clearRecentFiles.name} - ${e}`)
    }
    this.logger.log(`${this.clearRecentFiles.name} - ${nbCleared} records cleared - END`)
  }

  @Timeout(60000)
  @Cron(CronExpression.EVERY_4_HOURS)
  async indexContentFiles(): Promise<void> {
    this.logger.log(`${this.indexContentFiles.name} - START`)
    await this.filesContentManager.parseAndIndexAllFiles()
    this.logger.log(`${this.indexContentFiles.name} - END`)
  }
}
