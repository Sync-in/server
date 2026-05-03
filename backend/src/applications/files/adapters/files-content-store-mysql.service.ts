import { Inject, Injectable, Logger } from '@nestjs/common'
import { SQL, sql } from 'drizzle-orm'
import { MySqlQueryResult } from 'drizzle-orm/mysql2'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants'
import { DBSchema } from '../../../infrastructure/database/interfaces/database.interface'
import { FilesContentStore } from '../models/files-content-store'
import { FileContent, FileContentRecordMetadata, FileContentRecordMetadataMap } from '../schemas/file-content.interface'
import { createTableFilesContent, FILES_CONTENT_TABLE_PREFIX } from '../schemas/files-content.schema'
import { analyzeTerms, genTermsPattern, MaxSortedList } from '../utils/files-search'

@Injectable()
export class FilesContentStoreMySQL implements FilesContentStore {
  private readonly logger = new Logger(FilesContentStoreMySQL.name)

  constructor(@Inject(DB_TOKEN_PROVIDER) private readonly db: DBSchema) {}

  async indexesList(): Promise<string[]> {
    return (await this.getIndexes()).flatMap((r: Record<string, string>) => Object.values(r))
  }

  async indexesCount(): Promise<number> {
    return (await this.getIndexes()).length
  }

  getIndexName(tableSuffix: string): string {
    return `${FILES_CONTENT_TABLE_PREFIX}${tableSuffix}`
  }

  async existingIndexes(tableSuffixes: string[]): Promise<string[]> {
    const currentTables = await this.indexesList()
    return tableSuffixes.map((suffix) => this.getIndexName(suffix)).filter((table) => currentTables.indexOf(table) > -1)
  }

  async createIndex(tableName: string): Promise<boolean> {
    try {
      await this.db.execute(createTableFilesContent(tableName))
      await this.ensureRunIdColumn(tableName)
      return true
    } catch (e) {
      this.logger.error({ tag: this.createIndex.name, msg: `${tableName} : ${e}` })
      return false
    }
  }

  async dropIndex(tableName: string): Promise<boolean> {
    try {
      await this.db.execute(sql`DROP TABLE IF EXISTS ${sql.raw(tableName)} `)
      return true
    } catch (e) {
      this.logger.error({ tag: this.dropIndex.name, msg: `${tableName} : ${e}` })
      return false
    }
  }

  async insertRecord(tableName: string, fc: FileContent, runId: string): Promise<boolean> {
    try {
      await this.db.execute(sql`
          INSERT INTO ${sql.raw(tableName)} (id, path, name, mime, size, mtime, content, seen_run_id)
          VALUES ${sql`(${fc.id}, ${fc.path}, ${fc.name}, ${fc.mime}, ${fc.size}, ${fc.mtime}, ${fc.content}, ${runId})`}
          ON DUPLICATE KEY UPDATE path    = VALUES(path),
                                  name    = VALUES(name),
                                  mime    = VALUES(mime),
                                  size    = VALUES(size),
                                  mtime   = VALUES(mtime),
                                  content = VALUES(content),
                                  seen_run_id = VALUES(seen_run_id)
      `)
      return true
    } catch (e) {
      this.logger.error({ tag: this.insertRecord.name, msg: `${tableName} : ${e}` })
    }
    return false
  }

  async getRecordMetadataByIds(tableName: string, ids: number[]): Promise<FileContentRecordMetadataMap> {
    if (!ids.length) {
      return new Map()
    }
    const [r]: { id: number; path: string; name: string; size: number }[][] = (await this.db.execute(
      sql`SELECT id, path, name, size FROM ${sql.raw(tableName)} WHERE id IN (${sql.raw(ids.join(','))})`
    )) as MySqlQueryResult
    return new Map(
      r.map((row) => [row.id, { path: row.path, name: row.name, size: row.size }] satisfies [FileContent['id'], FileContentRecordMetadata])
    )
  }

  async markRecordsSeen(tableName: string, ids: number[], runId: string): Promise<boolean> {
    if (!ids.length) return true
    try {
      await this.db.execute(sql`UPDATE ${sql.raw(tableName)} SET seen_run_id = ${runId} WHERE id IN (${sql.raw(ids.join(','))})`)
      return true
    } catch (e) {
      this.logger.error({ tag: this.markRecordsSeen.name, msg: `${tableName} : ${e}` })
    }
    return false
  }

  async deleteRecords(tableName: string, ids: number[]): Promise<void> {
    try {
      const [r] = await this.db.execute(sql`DELETE FROM ${sql.raw(tableName)} WHERE id IN (${sql.raw(ids.join(','))})`)
      if (r.affectedRows !== ids.length) {
        this.logger.warn({ tag: this.deleteRecords.name, msg: `${tableName} - deleted : ${r.affectedRows}/${ids.length}` })
      }
    } catch (e) {
      this.logger.error({ tag: this.deleteRecords.name, msg: `${tableName} : ${e}` })
    }
  }

  async deleteUnseenRecords(tableName: string, runId: string): Promise<number> {
    try {
      const [r] = await this.db.execute(sql`DELETE FROM ${sql.raw(tableName)} WHERE seen_run_id IS NULL OR seen_run_id <> ${runId}`)
      return r.affectedRows ?? 0
    } catch (e) {
      this.logger.error({ tag: this.deleteUnseenRecords.name, msg: `${tableName} : ${e}` })
    }
    return 0
  }

  async searchRecords(tableNames: string[], search: string, limit: number): Promise<FileContent[]> {
    const terms: string[] = analyzeTerms(search)
    this.logger.verbose({ tag: this.searchRecords.name, msg: `convert ${search} -> ${JSON.stringify(terms)}` })
    if (!terms.length) {
      return []
    }
    // todo: use row iterator for better performance
    // mysql does not calculate MATCH results twice, can be used with select without worrying about performance
    const q: SQL = sql
      .join(
        tableNames.map(
          (tableName) =>
            sql`(SELECT id, path, name, mime, mtime, content, MATCH (content) AGAINST ( ${search} IN BOOLEAN MODE ) as score
              FROM ${sql.raw(tableName)}
              WHERE MATCH (content) AGAINST ( ${search} IN BOOLEAN MODE ) LIMIT ${limit})`
        ),
        sql.raw(' UNION ALL ')
      )
      .append(sql` ORDER BY score DESC LIMIT ${limit}`)

    const [records]: FileContent[][] = (await this.db.execute(q)) as MySqlQueryResult
    if (!records.length) {
      return []
    }

    const termsPattern = `(${genTermsPattern(terms)})`
    // const termsRegexp = new RegExp(`(?:\\b\\w+\\b[\\s\\W]){0,20}\\b${termsPattern}(?:\\s*\\S*){0,20}`, 'gi') // best performance
    const termsRegexp = new RegExp(`(?:\\b\\w+\\b[\\s\\W]{0,4}){0,10}\\b${termsPattern}(?:\\s*\\S*){0,15}`, 'gi')

    const termsHighlightRegexp = new RegExp(termsPattern, 'gi')
    for (const r of records) {
      const maxSortedList = new MaxSortedList(5)
      for (const i of r.content.matchAll(termsRegexp)) {
        const matches: string[] = i[0].match(termsHighlightRegexp).map((term) => term.toLowerCase())
        const nbDifferentWords: number = matches.length === 1 ? 1 : parseFloat(`${new Set(matches).size}.${matches.length}`)
        maxSortedList.insert([nbDifferentWords, i[0]])
      }
      // clear content
      r.content = undefined
      r.matches = maxSortedList.data.map(([_nb, content]) => content.replace(termsHighlightRegexp, '<mark>$1</mark>'))
    }
    return records
  }

  async cleanIndexes(tableSuffixes: string[]): Promise<void> {
    // remove outdated tables based on table suffixes
    if (!tableSuffixes.length) return
    const tableNames = tableSuffixes.map((s) => this.getIndexName(s))
    const tablesToDrop: string[] = (await this.indexesList()).filter((t: string) => tableNames.indexOf(t) === -1)
    for (const t of tablesToDrop) {
      this.logger.log({ tag: this.cleanIndexes.name, msg: `drop table : ${t}` })
      await this.dropIndex(t)
    }
  }

  async dropAllIndexes(): Promise<void> {
    for (const i of (await this.getIndexes()).flatMap((r: Record<string, string>) => Object.values(r))) {
      await this.dropIndex(i)
    }
  }

  private async getIndexes(): Promise<Record<string, string>[]> {
    return (await this.db.execute(sql`SHOW TABLES LIKE '${sql.raw(FILES_CONTENT_TABLE_PREFIX)}%'`))[0] as any
  }

  private async ensureRunIdColumn(tableName: string): Promise<void> {
    // migration for old versions of the application
    const [columns] = (await this.db.execute(sql`SHOW COLUMNS FROM ${sql.raw(tableName)} LIKE 'seen_run_id'`)) as MySqlQueryResult
    if ((columns as unknown[]).length) {
      return
    }
    await this.db.execute(sql`ALTER TABLE ${sql.raw(tableName)} ADD COLUMN seen_run_id varchar(64), ADD INDEX seen_run_id (seen_run_id)`)
  }
}
