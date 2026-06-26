import { Inject, Injectable, Logger } from '@nestjs/common'
import { SQL, sql } from 'drizzle-orm'
import { MySqlQueryResult } from 'drizzle-orm/mysql2'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants'
import { DBSchema } from '../../../infrastructure/database/interfaces/database.interface'
import { FilesContentStore } from '../models/files-content-store'
import { FileContent, FileContentRecordMetadata, FileContentRecordMetadataMap } from '../schemas/file-content.interface'
import { createTableFilesContent, FILES_CONTENT_TABLE_PREFIX } from '../schemas/files-content.schema'
import { genTermsPattern, likeSearchTermStartPattern, MaxSortedList, parseSearchTerms, SearchTerm } from '../utils/files-search'

type SearchCandidate = Pick<FileContent, 'id' | 'score'> & { sourceIndex: string }
type SearchRecord = FileContent & { sourceIndex: string }

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
      sql`SELECT id, path, name, size FROM ${sql.raw(tableName)} WHERE id IN (${idsSqlList(ids)})`
    )) as MySqlQueryResult
    return new Map(
      r.map((row) => [row.id, { path: row.path, name: row.name, size: row.size }] satisfies [FileContent['id'], FileContentRecordMetadata])
    )
  }

  async markRecordsSeen(tableName: string, ids: number[], runId: string): Promise<boolean> {
    if (!ids.length) return true
    try {
      await this.db.execute(sql`UPDATE ${sql.raw(tableName)} SET seen_run_id = ${runId} WHERE id IN (${idsSqlList(ids)})`)
      return true
    } catch (e) {
      this.logger.error({ tag: this.markRecordsSeen.name, msg: `${tableName} : ${e}` })
    }
    return false
  }

  async deleteRecords(tableName: string, ids: number[]): Promise<void> {
    try {
      const [r] = await this.db.execute(sql`DELETE FROM ${sql.raw(tableName)} WHERE id IN (${idsSqlList(ids)})`)
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
    const searchTerms = parseSearchTerms(search)
    const positiveTerms = searchTerms.filter(({ operator }) => operator !== 'excluded')
    const requiredTerms = searchTerms.filter(({ operator }) => operator === 'required')
    const optionalTerms = searchTerms.filter(({ operator }) => operator === 'optional')
    const excludedTerms = searchTerms.filter(({ operator }) => operator === 'excluded')
    const terms = positiveTerms.map(({ regexpValue }) => regexpValue)
    const useLikeSearch = searchTerms.some(({ requiresLike }) => requiresLike)
    this.logger.verbose({ tag: this.searchRecords.name, msg: `convert ${search} -> ${JSON.stringify(terms)}` })
    if (!terms.length) {
      return []
    }
    // Searches containing a script unsupported by FULLTEXT tokenization use LIKE for every term.
    // Other searches keep the indexed FULLTEXT path.
    const q: SQL = sql
      .join(
        tableNames.map((tableName) => {
          if (useLikeSearch) {
            const requiredMatch = createContentMatch(requiredTerms, ' AND ')
            const optionalMatch = createContentMatch(optionalTerms, ' OR ')
            const positiveMatch = requiredMatch || optionalMatch
            const excludedMatch = createContentMatch(excludedTerms, ' AND ', true)
            const score = positiveTerms.reduce<SQL>(
              (value, term) => sql`${value} + IF(content LIKE ${toLikePattern(term.rawValue)} ESCAPE '=', 1, 0)`,
              sql.raw('0')
            )
            return sql`(SELECT ${tableName} as sourceIndex, id, ${score} as score
              FROM ${sql.raw(tableName)}
              WHERE (${positiveMatch})
                ${excludedMatch ? sql`AND ${excludedMatch}` : sql``}
              ORDER BY score DESC
              LIMIT ${limit})`
          }

          const fullTextMatch = sql`MATCH (content) AGAINST ( ${search} IN BOOLEAN MODE )`
          return sql`(SELECT ${tableName} as sourceIndex, id, ${fullTextMatch} as score
              FROM ${sql.raw(tableName)}
              WHERE ${fullTextMatch}
              ORDER BY score DESC
              LIMIT ${limit})`
        }),
        sql.raw(' UNION ALL ')
      )
      .append(sql` ORDER BY score DESC LIMIT ${limit}`)

    const [candidateRecords]: SearchCandidate[][] = (await this.db.execute(q)) as MySqlQueryResult
    const selectedCandidates = candidateRecords.slice(0, limit)
    if (!selectedCandidates.length) {
      return []
    }

    // Load LONGTEXT only for the final candidates to avoid carrying it through UNION and ORDER BY.
    const idsByIndex = new Map<string, number[]>()
    for (const candidate of selectedCandidates) {
      const ids = idsByIndex.get(candidate.sourceIndex) || []
      ids.push(candidate.id)
      idsByIndex.set(candidate.sourceIndex, ids)
    }
    const recordsQuery = sql.join(
      tableNames.flatMap((tableName) => {
        const ids = idsByIndex.get(tableName)
        if (!ids?.length) return []
        return [
          sql`SELECT ${tableName} as sourceIndex, id, path, name, mime, mtime, content
              FROM ${sql.raw(tableName)}
              WHERE id IN (${idsSqlList(ids)})`
        ]
      }),
      sql.raw(' UNION ALL ')
    )
    const [loadedRecords]: SearchRecord[][] = (await this.db.execute(recordsQuery)) as MySqlQueryResult
    const recordsByKey = new Map(loadedRecords.map((record) => [`${record.sourceIndex}:${record.id}`, record]))
    const records = selectedCandidates.flatMap((candidate) => {
      const record = recordsByKey.get(`${candidate.sourceIndex}:${candidate.id}`)
      return record ? [{ ...record, score: candidate.score }] : []
    })

    const termsPattern = `(${genTermsPattern(terms)})`
    const termsRegexp = new RegExp(`(?:\\b\\w+\\b[\\s\\W]{0,4}){0,10}(?:\\b|${likeSearchTermStartPattern()})${termsPattern}(?:\\s*\\S*){0,15}`, 'giu')

    const termsHighlightRegexp = new RegExp(termsPattern, 'giu')
    for (const r of records) {
      const maxSortedList = new MaxSortedList(5)
      for (const i of r.content.matchAll(termsRegexp)) {
        const matches: string[] = i[0].match(termsHighlightRegexp).map((term) => term.toLowerCase())
        const nbDifferentWords: number = matches.length === 1 ? 1 : parseFloat(`${new Set(matches).size}.${matches.length}`)
        maxSortedList.insert([nbDifferentWords, i[0]])
      }
      // Do not expose the full indexed content in search results.
      r.content = undefined
      r.matches = maxSortedList.data.map(([_nb, content]) => content.replace(termsHighlightRegexp, '<mark>$1</mark>'))
    }
    return records.map(({ sourceIndex: _sourceIndex, ...record }) => record)
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

function toLikePattern(term: string): string {
  return `%${term.replaceAll('=', '==').replaceAll('%', '=%').replaceAll('_', '=_')}%`
}

function createContentMatch(terms: SearchTerm[], separator: ' AND ' | ' OR ', negate = false): SQL | null {
  if (!terms.length) return null
  return sql.join(
    terms.map(({ rawValue }) =>
      negate ? sql`content NOT LIKE ${toLikePattern(rawValue)} ESCAPE '='` : sql`content LIKE ${toLikePattern(rawValue)} ESCAPE '='`
    ),
    sql.raw(separator)
  )
}

function idsSqlList(ids: number[]): SQL {
  return sql.join(
    ids.map((id) => sql`${id}`),
    sql.raw(', ')
  )
}
