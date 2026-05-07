import { Inject, Injectable, Logger } from '@nestjs/common'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants'
import { DBSchema } from '../../../infrastructure/database/interfaces/database.interface'
import { FILE_REPOSITORY } from '../constants/operations'
import { users } from '../../users/schemas/users.schema'
import { and, eq, inArray, lte, sql } from 'drizzle-orm'
import { USER_ROLE } from '../../users/constants/user'
import { UserModel } from '../../users/models/user.model'
import { isPathExists, removeFiles } from '../utils/files'
import { spaces } from '../../spaces/schemas/spaces.schema'
import { SpaceModel } from '../../spaces/models/space.model'
import { configuration } from '../../../configuration/config.environment'
import { genIndexingKey, genRunId } from '../utils/indexing'
import { createTableFilesTrash, FILES_TRASH_TABLE_PREFIX } from '../schemas/files-trash.schema'
import { FileParseTrashRetentionPath, FileTrashRetentionIndexContext } from '../interfaces/file-parse-index'
import { escapePath } from '../../../common/functions'
import { MySqlQueryResult } from 'drizzle-orm/mysql2'
import { FileTrash, FileTrashCleanupResult, FileTrashRecordMetadata, FileTrashRecordMetadataMap } from '../schemas/file-trash.interface'
import fs from 'fs/promises'
import path from 'node:path'
import { Stats } from 'node:fs'

@Injectable()
export class FilesTrashRetention {
  private readonly logger = new Logger(FilesTrashRetention.name)
  private readonly retentionDays = configuration.applications.files.trashRetentionDays
  private readonly fileBatchSize = 1000

  constructor(@Inject(DB_TOKEN_PROVIDER) private readonly db: DBSchema) {}

  async indexAndCleanTrash(userIds?: number[], spaceIds?: number[]): Promise<void> {
    if (this.retentionDays === false) return
    for (const p of await this.allPaths(userIds, spaceIds)) {
      const tableName = this.getTableName(genIndexingKey(p.id, p.type))
      if (!(await this.createTable(tableName))) {
        continue
      }
      // this run id marks records still present on the filesystem; old run ids become stale DB rows after the scan.
      const runId = genRunId()
      const context: FileTrashRetentionIndexContext = {
        tableName: tableName,
        regexBasePath: new RegExp(`^/?${escapePath(p.realPath)}/?`)
      }
      let indexedRecords = 0
      let errorRecords = 0
      let scannedRecords = 0

      const processBatch = async (batch: FileTrash[]): Promise<void> => {
        const result = await this.indexTrashBatch(tableName, runId, batch)
        indexedRecords += result.indexedRecords
        errorRecords += result.errorRecords
        scannedRecords += batch.length
      }

      let batch: FileTrash[] = []
      for await (const fileTrash of this.parseFiles(p.realPath, context)) {
        batch.push(fileTrash)
        if (batch.length >= this.fileBatchSize) {
          await processBatch(batch)
          batch = []
        }
      }
      await processBatch(batch)

      // The scan is the source of truth for this disposable retention table:
      // records not seen in this run are removed before applying retention.
      const deletedRecords = await this.deleteUnseenRecords(tableName, runId)
      if (deletedRecords === null) {
        this.logger.error({ tag: this.indexAndCleanTrash.name, msg: `${tableName} - cleanup skipped because unseen records could not be deleted` })
        continue
      }
      const expiredRecords = await this.cleanupExpiredRecords(tableName, p.realPath)
      const totalErrorRecords = errorRecords + expiredRecords.errorRecords

      if (scannedRecords === 0 && indexedRecords === 0 && deletedRecords === 0 && expiredRecords.deletedRecords === 0) {
        this.dropTable(tableName).catch((e: Error) =>
          this.logger.error({ tag: this.indexAndCleanTrash.name, msg: `${tableName} - unable to drop table : ${e}` })
        )
        this.logger.verbose({ tag: this.indexAndCleanTrash.name, msg: `${tableName} - no data, index not stored` })
      } else if (indexedRecords === 0 && totalErrorRecords === 0 && deletedRecords === 0 && expiredRecords.deletedRecords === 0) {
        this.logger.verbose({ tag: this.indexAndCleanTrash.name, msg: `${tableName} - no new data` })
      } else {
        this.logger.log({
          tag: this.indexAndCleanTrash.name,
          msg: `${tableName} - indexed: ${indexedRecords - errorRecords}, deleted: ${deletedRecords}, expired: ${expiredRecords.deletedRecords}, errors: ${totalErrorRecords}`
        })
      }
    }
  }

  private async indexTrashBatch(tableName: string, runId: string, batch: FileTrash[]): Promise<{ indexedRecords: number; errorRecords: number }> {
    if (!batch.length) {
      return { indexedRecords: 0, errorRecords: 0 }
    }

    const dbRecords = await this.getRecordMetadataByIds(
      tableName,
      batch.map((f) => f.id)
    )
    const seenRecordIds: number[] = []
    let indexedRecords = 0
    let errorRecords = 0

    for (const fileTrash of batch) {
      const dbRecord = dbRecords.get(fileTrash.id)
      if (dbRecord && dbRecord.path === fileTrash.path && dbRecord.isDir === fileTrash.isDir) {
        // unchanged records are not upserted, so they are marked as seen in bulk after the batch.
        seenRecordIds.push(fileTrash.id)
        continue
      }

      if ((await this.insertRecord(tableName, fileTrash, runId)) === false) {
        // A failed refresh may leave an old path/isDir in DB; do not mark it seen.
        // `deleteUnseenRecords` will discard the stale row instead of retaining unsafe metadata.
        errorRecords++
      }
      indexedRecords++
    }

    if (!(await this.markRecordsSeen(tableName, seenRecordIds, runId))) {
      throw new Error(`${tableName} - unable to mark records as seen`)
    }

    return { indexedRecords, errorRecords }
  }

  private async allPaths(userIds?: number[], spaceIds?: number[]): Promise<FileParseTrashRetentionPath[]> {
    const hasNoFilters = userIds === undefined && spaceIds === undefined
    const includeUsers = hasNoFilters || !!userIds?.length
    const includeSpaces = hasNoFilters || !!spaceIds?.length

    const [userPaths, spacePaths] = await Promise.all([includeUsers ? this.userPaths(userIds) : [], includeSpaces ? this.spacePaths(spaceIds) : []])

    return [...userPaths, ...spacePaths]
  }

  private async userPaths(userIds?: number[]): Promise<FileParseTrashRetentionPath[]> {
    const paths: FileParseTrashRetentionPath[] = []
    for (const user of await this.db
      .select({
        id: users.id,
        login: users.login
      })
      .from(users)
      .where(and(...[lte(users.role, USER_ROLE.USER), ...(userIds ? [inArray(users.id, userIds)] : [])]))) {
      const userTrashPath = UserModel.getTrashPath(user.login)
      if (!(await isPathExists(userTrashPath))) {
        this.logger.warn({ tag: this.userPaths.name, msg: `user trash path does not exist : ${userTrashPath}` })
        continue
      }
      paths.push({ id: user.id, type: FILE_REPOSITORY.USER, realPath: userTrashPath })
    }
    return paths
  }

  private async spacePaths(spaceIds?: number[]): Promise<FileParseTrashRetentionPath[]> {
    const paths: FileParseTrashRetentionPath[] = []
    for (const space of await this.db
      .select({
        id: spaces.id,
        alias: spaces.alias
      })
      .from(spaces)
      .where(and(eq(spaces.enabled, true), ...(spaceIds ? [inArray(spaces.id, spaceIds)] : [])))) {
      const spaceTrashPath = SpaceModel.getTrashPath(space.alias)
      if (!(await isPathExists(spaceTrashPath))) {
        this.logger.warn({ tag: this.spacePaths.name, msg: `space trash path does not exist : ${spaceTrashPath}` })
        continue
      }
      paths.push({ id: space.id, type: FILE_REPOSITORY.SPACE, realPath: spaceTrashPath })
    }
    return paths
  }

  private async *parseFiles(dir: string, context: FileTrashRetentionIndexContext): AsyncGenerator<FileTrash> {
    try {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const realPath = path.join(entry.parentPath, entry.name)
        const fileContent = await this.analyzeFile(realPath, context)
        if (fileContent !== null) {
          yield fileContent
        }
        if (entry.isDirectory()) {
          yield* this.parseFiles(realPath, context)
        }
      }
    } catch (e) {
      this.logger.warn({ tag: this.parseFiles.name, msg: `${context.tableName} - unable to parse: ${dir} - ${e}` })
    }
  }

  private async analyzeFile(realPath: string, context: FileTrashRetentionIndexContext): Promise<FileTrash | null> {
    let stats: Stats
    try {
      stats = await fs.lstat(realPath)
    } catch (e) {
      this.logger.warn({ tag: this.analyzeFile.name, msg: `unable to stats: ${realPath} - ${e}` })
      return null
    }
    const filePath = realPath.replace(context.regexBasePath, '')

    return {
      id: stats.ino,
      path: filePath,
      isDir: stats.isDirectory()
    } satisfies FileTrash
  }

  private getTableName(indexSuffix: string): string {
    return `${FILES_TRASH_TABLE_PREFIX}${indexSuffix}`
  }

  private async createTable(tableName: string): Promise<boolean> {
    try {
      await this.db.execute(createTableFilesTrash(tableName))
      return true
    } catch (e) {
      this.logger.error({ tag: this.createTable.name, msg: `${tableName} : ${e}` })
      return false
    }
  }

  private async dropTable(tableName: string): Promise<boolean> {
    try {
      await this.db.execute(sql`DROP TABLE IF EXISTS ${sql.raw(tableName)} `)
      return true
    } catch (e) {
      this.logger.error({ tag: this.dropTable.name, msg: `${tableName} : ${e}` })
      return false
    }
  }

  private async getRecordMetadataByIds(tableName: string, ids: number[]): Promise<FileTrashRecordMetadataMap> {
    if (!ids.length) {
      return new Map()
    }
    const [r]: { id: number; path: string; isDir: boolean }[][] = (await this.db.execute(
      sql`SELECT id, path, isDir FROM ${sql.raw(tableName)} WHERE id IN (${sql.raw(ids.join(','))})`
    )) as MySqlQueryResult
    return new Map(r.map((row) => [row.id, { path: row.path, isDir: Boolean(row.isDir) }] satisfies [FileTrash['id'], FileTrashRecordMetadata]))
  }

  private async markRecordsSeen(tableName: string, ids: number[], runId: string): Promise<boolean> {
    if (!ids.length) return true
    try {
      await this.db.execute(sql`UPDATE ${sql.raw(tableName)} SET seen_run_id = ${runId} WHERE id IN (${sql.raw(ids.join(','))})`)
      return true
    } catch (e) {
      this.logger.error({ tag: this.markRecordsSeen.name, msg: `${tableName} : ${e}` })
    }
    return false
  }

  private async insertRecord(tableName: string, ft: FileTrash, runId: string): Promise<boolean> {
    try {
      await this.db.execute(sql`
          INSERT INTO ${sql.raw(tableName)} (id, path, isDir, seen_run_id)
          VALUES ${sql`(${ft.id}, ${ft.path}, ${ft.isDir}, ${runId})`}
          -- If an inode is reused or moved inside trash, restart retention for the new metadata.
          ON DUPLICATE KEY UPDATE path    = VALUES(path),
                                  isDir   = VALUES(isDir),
                                  deletedAt = CURRENT_DATE,
                                  seen_run_id = VALUES(seen_run_id)
      `)
      return true
    } catch (e) {
      this.logger.error({ tag: this.insertRecord.name, msg: `${tableName} : ${e}` })
    }
    return false
  }

  private async deleteUnseenRecords(tableName: string, runId: string): Promise<number | null> {
    try {
      const [r] = await this.db.execute(sql`DELETE FROM ${sql.raw(tableName)} WHERE seen_run_id IS NULL OR seen_run_id <> ${runId}`)
      return r.affectedRows ?? 0
    } catch (e) {
      this.logger.error({ tag: this.deleteUnseenRecords.name, msg: `${tableName} : ${e}` })
    }
    return null
  }

  private async cleanupExpiredRecords(tableName: string, realBasePath: string): Promise<FileTrashCleanupResult> {
    if (this.retentionDays === false) {
      return { deletedRecords: 0, errorRecords: 0 }
    }

    const fileResult = await this.cleanupExpiredRecordsByType(tableName, realBasePath, false)
    const dirResult = await this.cleanupExpiredRecordsByType(tableName, realBasePath, true)

    return {
      deletedRecords: fileResult.deletedRecords + dirResult.deletedRecords,
      errorRecords: fileResult.errorRecords + dirResult.errorRecords
    }
  }

  private async cleanupExpiredRecordsByType(tableName: string, realBasePath: string, isDir: boolean): Promise<FileTrashCleanupResult> {
    // Process fixed-size pages. Filesystem failures are kept in DB and retried on a later run.
    // They are ignored only for the current run so later eligible records are not blocked.
    const result: FileTrashCleanupResult = { deletedRecords: 0, errorRecords: 0 }
    const ignoredIds: number[] = []

    while (true) {
      const expiredRecords = await this.getExpiredRecords(tableName, isDir, [...ignoredIds])
      if (!expiredRecords.length) {
        break
      }

      const deletedIds: number[] = []
      for (const record of expiredRecords) {
        if (await this.deleteTrashRecordFile(realBasePath, record)) {
          deletedIds.push(record.id)
        } else {
          result.errorRecords++
          ignoredIds.push(record.id)
        }
      }

      if (!deletedIds.length) {
        continue
      }

      const deletedRecords = await this.deleteRecordsByIds(tableName, deletedIds)
      if (deletedRecords === null) {
        result.errorRecords += deletedIds.length
        break
      }
      result.deletedRecords += deletedRecords

      if (deletedRecords < deletedIds.length) {
        result.errorRecords += deletedIds.length - deletedRecords
        break
      }
    }

    return result
  }

  private async getExpiredRecords(tableName: string, isDir: boolean, ignoredIds: number[] = []): Promise<FileTrash[]> {
    if (this.retentionDays === false) {
      return []
    }
    const ignoredRecordsFilter = ignoredIds.length ? sql`AND trash_record.id NOT IN (${sql.raw(ignoredIds.join(','))})` : sql``
    const escapedRecordPath = sql`REPLACE(REPLACE(REPLACE(trash_record.path, '=', '=='), '%', '=%'), '_', '=_')`
    // Directories are eligible only after their indexed children are gone.
    // Once selected, removeFiles can delete any remaining filesystem content recursively.
    const emptyDirectoryFilter = isDir
      ? sql`
          AND NOT EXISTS (SELECT 1
                          FROM ${sql.raw(tableName)} AS child
                          WHERE child.id <> trash_record.id
                            AND child.path LIKE CONCAT(${escapedRecordPath}, '/%') ESCAPE '=')
      `
      : sql``
    // Keep the predicate and ordering aligned with the (isDir, deletedAt) index.
    const req = sql`
      SELECT trash_record.id, trash_record.path, trash_record.isDir, trash_record.deletedAt
      FROM ${sql.raw(tableName)} AS trash_record
      WHERE trash_record.deletedAt < DATE_SUB(CURRENT_DATE, INTERVAL ${this.retentionDays} DAY)
        AND trash_record.isDir = ${isDir}
        ${ignoredRecordsFilter}
        ${emptyDirectoryFilter}
      ORDER BY trash_record.deletedAt, trash_record.id
      LIMIT ${this.fileBatchSize}
    `
    const [r]: { id: number; path: string; isDir: boolean; deletedAt: Date }[][] = (await this.db.execute(req)) as MySqlQueryResult
    return r.map((row) => ({ id: row.id, path: row.path, isDir: Boolean(row.isDir), deletedAt: row.deletedAt }) satisfies FileTrash)
  }

  private async deleteRecordsByIds(tableName: string, ids: number[]): Promise<number | null> {
    if (!ids.length) {
      return 0
    }
    try {
      const [r] = await this.db.execute(sql`DELETE FROM ${sql.raw(tableName)} WHERE id IN (${sql.raw(ids.join(','))})`)
      if (r.affectedRows !== ids.length) {
        this.logger.warn({ tag: this.deleteRecordsByIds.name, msg: `${tableName} - deleted : ${r.affectedRows}/${ids.length}` })
      }
      return r.affectedRows ?? 0
    } catch (e) {
      this.logger.error({ tag: this.deleteRecordsByIds.name, msg: `${tableName} : ${e}` })
    }
    return null
  }

  private async deleteTrashRecordFile(realBasePath: string, ft: FileTrash): Promise<boolean> {
    // `removeFiles` is recursive and tolerant of missing paths; success means the DB row can go.
    try {
      const realPath = this.resolveTrashRecordPath(realBasePath, ft)
      await removeFiles(realPath)
      return true
    } catch (e) {
      this.logger.error({ tag: this.deleteTrashRecordFile.name, msg: `${realBasePath}/${ft.path} : ${e}` })
    }
    return false
  }

  private resolveTrashRecordPath(realBasePath: string, ft: Pick<FileTrash, 'path'>): string {
    const basePath = path.resolve(realBasePath)
    const realPath = path.resolve(basePath, ft.path)

    // DB paths are resolved against the trash root and must stay inside it before any filesystem deletion.
    if (realPath !== basePath && realPath.startsWith(`${basePath}${path.sep}`)) {
      return realPath
    }

    throw new Error(`${realPath} is outside trash path ${basePath}`)
  }
}
