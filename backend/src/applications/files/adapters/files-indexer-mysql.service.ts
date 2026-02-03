import { Inject, Injectable, Logger } from '@nestjs/common'
import { SQL, sql } from 'drizzle-orm'
import { MySqlQueryResult } from 'drizzle-orm/mysql2'
import { CacheDecorator } from '../../../infrastructure/cache/cache.decorator'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants'
import { DBSchema } from '../../../infrastructure/database/interfaces/database.interface'
import { FilesIndexer } from '../models/files-indexer'
import { FileContent } from '../schemas/file-content.interface'
import { createTableFilesContent, FILES_CONTENT_TABLE_PREFIX } from '../schemas/files-content.schema'
import { analyzeTerms, genTermsPattern, MaxSortedList } from '../utils/files-search'

@Injectable()
export class FilesIndexerMySQL implements FilesIndexer {
  private readonly logger = new Logger(FilesIndexerMySQL.name)

  constructor(@Inject(DB_TOKEN_PROVIDER) private readonly db: DBSchema) {}

  @CacheDecorator(900) // 15 mn
  async indexesList(): Promise<string[]> {
    return ((await this.db.execute(sql`SHOW TABLES LIKE '${sql.raw(FILES_CONTENT_TABLE_PREFIX)}%'`))[0] as any).flatMap((r: Record<string, string>) =>
      Object.values(r)
    )
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
      return true
    } catch (e) {
      this.logger.error(`${this.createIndex.name} - ${tableName} : ${e}`)
      return false
    }
  }

  async dropIndex(tableName: string): Promise<boolean> {
    try {
      await this.db.execute(sql`DROP TABLE IF EXISTS ${sql.raw(tableName)} `)
      return true
    } catch (e) {
      this.logger.error(`${this.dropIndex.name} - ${tableName} : ${e}`)
      return false
    }
  }

  async insertRecord(tableName: string, fc: FileContent): Promise<void> {
    try {
      await this.db.execute(sql`
          INSERT INTO ${sql.raw(tableName)} (id, path, name, mime, size, mtime, content)
          VALUES ${sql`(${fc.id}, ${fc.path}, ${fc.name}, ${fc.mime}, ${fc.size}, ${fc.mtime}, ${fc.content})`}
          ON DUPLICATE KEY UPDATE path    = VALUES(path),
                                  name    = VALUES(name),
                                  mime    = VALUES(mime),
                                  size    = VALUES(size),
                                  mtime   = VALUES(mtime),
                                  content = VALUES(content)
      `)
    } catch (e) {
      this.logger.error(`${this.insertRecord.name} - ${tableName} : ${e}`)
    }
  }

  async getRecordStats(tableName: string, path?: string): Promise<Map<number, { path: string; name: string; size: number }>> {
    const q: SQL = sql`SELECT id, path, name, size
                       FROM ${sql.raw(tableName)}`
    if (path) {
      q.append(sql` WHERE path = ${path}`)
    }
    const [r]: { id: number; path: string; name: string; size: number }[][] = (await this.db.execute(q)) as MySqlQueryResult
    return new Map(r.map((row) => [row.id, { path: row.path, name: row.name, size: row.size }]))
  }

  async deleteRecords(tableName: string, ids: number[]): Promise<void> {
    try {
      const [r] = await this.db.execute(sql`DELETE
                                            FROM ${sql.raw(tableName)}
                                            WHERE id IN (${sql.raw(ids.join(','))})`)
      if (r.affectedRows !== ids.length) {
        this.logger.warn(`${this.deleteRecords.name} - ${tableName} - deleted : ${r.affectedRows}/${ids.length}`)
      }
    } catch (e) {
      this.logger.error(`${this.deleteRecords.name} - ${tableName} : ${e}`)
    }
  }

  async searchRecords(tableNames: string[], search: string, limit: number): Promise<FileContent[]> {
    const terms: string[] = analyzeTerms(search)
    this.logger.debug(`${this.searchRecords.name} - convert ${search} -> ${JSON.stringify(terms)}`)
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
    // remove old tables
    if (!tableSuffixes.length) return
    const tableNames = tableSuffixes.map((s) => this.getIndexName(s))
    const tablesToDrop: string[] = (await this.indexesList()).filter((t: string) => tableNames.indexOf(t) === -1)
    for (const t of tablesToDrop) {
      this.logger.log(`${this.cleanIndexes.name} - drop table : ${t}`)
      await this.dropIndex(t)
    }
  }
}
