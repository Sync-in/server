import { Inject, Injectable, Logger } from '@nestjs/common'
import { SQL, sql } from 'drizzle-orm'
import { MySqlQueryResult } from 'drizzle-orm/mysql2'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants'
import { DBSchema } from '../../../infrastructure/database/interfaces/database.interface'
import { FILE_REPOSITORY } from '../constants/operations'
import type { FilesSearchTerm } from '../interfaces/files-search-query.interface'
import { FilesContentStore } from '../models/files-content-store'
import { FileContent, FileContentRecordMetadata, FileContentRecordMetadataMap } from '../schemas/file-content.interface'
import { createTableFilesContent, FILES_CONTENT_TABLE_PREFIX } from '../schemas/files-content.schema'
import { genTermsPattern, likeSearchTermStartPattern, MaxSortedList, parseFilesSearchQuery } from '../utils/files-search'

type SearchCandidate = Pick<FileContent, 'id' | 'score'> & { sourceIndex: string }
type SearchRecord = FileContent & { sourceIndex: string }
interface HighlightMatch {
  index: number
  value: string
}
interface HighlightContext {
  start: number
  end: number
  matches: HighlightMatch[]
}
const HIGHLIGHT_WORD_CHAR = '[\\p{L}\\p{M}\\p{N}]'
const HIGHLIGHT_TERM_START = `(?<!${HIGHLIGHT_WORD_CHAR})`
const HIGHLIGHT_TERM_END = `(?!${HIGHLIGHT_WORD_CHAR})`
const HIGHLIGHT_CONTEXT_SEPARATOR = '[^\\p{L}\\p{M}\\p{N}]'
const HIGHLIGHT_UNICODE_WORD_CHARACTER_PATTERN = /[\p{L}\p{M}\p{N}]/uy
const HIGHLIGHT_CONTEXT_WORDS_BEFORE = 10
const HIGHLIGHT_CONTEXT_WORDS_AFTER = 15
const HIGHLIGHT_CONTEXT_CHARS_BEFORE = 512
const HIGHLIGHT_CONTEXT_CHARS_AFTER = 768
const FILES_CONTENT_TABLE_PATTERN = new RegExp(`^${FILES_CONTENT_TABLE_PREFIX}(?:${Object.values(FILE_REPOSITORY).join('|')})_[0-9]+$`)

@Injectable()
export class FilesContentStoreMySQL implements FilesContentStore {
  private static readonly INVALID_TRAILING_FULL_TEXT_OPERATORS = new Set(['+', '-'])
  private static readonly FULL_TEXT_WHITESPACE_PATTERN = /\s/u
  private static readonly FULL_TEXT_TERM_CHARACTER_PATTERN = /[\p{L}\p{M}\p{N}]/u
  private static readonly FULL_TEXT_COMPOUND_TERM_PATTERN =
    /(^|[\s(])([+-]?)([\p{L}\p{M}\p{N}]+(?:[^\p{L}\p{M}\p{N}\s"]+[\p{L}\p{M}\p{N}]+)+)(?=[\s),.!?;:]|$)/gu
  private static readonly FULL_TEXT_TERM_TOKEN_PATTERN = /[\p{L}\p{M}\p{N}]+/gu
  private readonly logger = new Logger(FilesContentStoreMySQL.name)

  constructor(@Inject(DB_TOKEN_PROVIDER) private readonly db: DBSchema) {}

  async indexesList(): Promise<string[]> {
    return (await this.getIndexes())
      .flatMap((r: Record<string, string>) => Object.values(r))
      .filter((tableName) => FILES_CONTENT_TABLE_PATTERN.test(tableName))
  }

  async indexesCount(): Promise<number> {
    return (await this.indexesList()).length
  }

  getIndexName(tableSuffix: string): string {
    return `${FILES_CONTENT_TABLE_PREFIX}${tableSuffix}`
  }

  async existingIndexes(tableSuffixes: string[]): Promise<string[]> {
    const currentTables = new Set(await this.indexesList())
    return tableSuffixes.map((suffix) => this.getIndexName(suffix)).filter((table) => currentTables.has(table))
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
    if (!FILES_CONTENT_TABLE_PATTERN.test(tableName)) {
      this.logger.error({ tag: this.dropIndex.name, msg: `refusing to drop unmanaged table: ${tableName}` })
      return false
    }
    try {
      await this.db.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(tableName)} `)
      return true
    } catch (e) {
      this.logger.error({ tag: this.dropIndex.name, msg: `${tableName} : ${e}` })
      return false
    }
  }

  async insertRecord(tableName: string, fc: FileContent, runId: string): Promise<boolean> {
    try {
      await this.db.execute(sql`
          INSERT INTO ${sql.identifier(tableName)} (id, path, name, mime, size, mtime, content, seen_run_id)
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
      sql`SELECT id, path, name, size FROM ${sql.identifier(tableName)} WHERE id IN (${idsSqlList(ids)})`
    )) as MySqlQueryResult
    return new Map(
      r.map((row) => [row.id, { path: row.path, name: row.name, size: row.size }] satisfies [FileContent['id'], FileContentRecordMetadata])
    )
  }

  async markRecordsSeen(tableName: string, ids: number[], runId: string): Promise<boolean> {
    if (!ids.length) return true
    try {
      await this.db.execute(sql`UPDATE ${sql.identifier(tableName)} SET seen_run_id = ${runId} WHERE id IN (${idsSqlList(ids)})`)
      return true
    } catch (e) {
      this.logger.error({ tag: this.markRecordsSeen.name, msg: `${tableName} : ${e}` })
    }
    return false
  }

  async deleteRecords(tableName: string, ids: number[]): Promise<void> {
    try {
      const [r] = await this.db.execute(sql`DELETE FROM ${sql.identifier(tableName)} WHERE id IN (${idsSqlList(ids)})`)
      if (r.affectedRows !== ids.length) {
        this.logger.warn({ tag: this.deleteRecords.name, msg: `${tableName} - deleted : ${r.affectedRows}/${ids.length}` })
      }
    } catch (e) {
      this.logger.error({ tag: this.deleteRecords.name, msg: `${tableName} : ${e}` })
    }
  }

  async deleteUnseenRecords(tableName: string, runId: string): Promise<number> {
    try {
      const [r] = await this.db.execute(sql`DELETE FROM ${sql.identifier(tableName)} WHERE seen_run_id IS NULL OR seen_run_id <> ${runId}`)
      return r.affectedRows ?? 0
    } catch (e) {
      this.logger.error({ tag: this.deleteUnseenRecords.name, msg: `${tableName} : ${e}` })
    }
    return 0
  }

  async searchRecords(tableNames: string[], search: string, limit: number): Promise<FileContent[]> {
    const normalizedSearch = FilesContentStoreMySQL.normalizeFullTextSearch(search)
    const { terms: searchTerms, positiveTerms, requiredTerms, optionalTerms, excludedTerms } = parseFilesSearchQuery(normalizedSearch)
    const terms = positiveTerms.map(({ regexpValue }) => regexpValue)
    const useLikeSearch = searchTerms.some(({ requiresLike }) => requiresLike)
    this.logger.verbose({ tag: this.searchRecords.name, msg: `convert ${search} -> ${normalizedSearch} -> ${JSON.stringify(terms)}` })
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
            const score = optionalTerms.reduce<SQL>(
              (value, term) => sql`${value} + IF(content LIKE ${toLikePattern(term.rawValue)} ESCAPE '=', 1, 0)`,
              sql`${requiredTerms.length}`
            )
            return sql`(SELECT ${tableName} as sourceIndex, id, ${score} as score
              FROM ${sql.identifier(tableName)}
              WHERE (${positiveMatch})
                ${excludedMatch ? sql`AND ${excludedMatch}` : sql``}
              ORDER BY score DESC
              LIMIT ${limit})`
          }

          const fullTextMatch = sql`MATCH (content) AGAINST ( ${normalizedSearch} IN BOOLEAN MODE )`
          return sql`(SELECT ${tableName} as sourceIndex, id, ${fullTextMatch} as score
              FROM ${sql.identifier(tableName)}
              WHERE ${fullTextMatch}
              ORDER BY score DESC
              LIMIT ${limit})`
        }),
        sql` UNION ALL `
      )
      .append(sql` ORDER BY score DESC LIMIT ${limit}`)

    const [candidateRecords]: SearchCandidate[][] = (await this.db.execute(q)) as MySqlQueryResult
    if (!candidateRecords.length) {
      return []
    }

    // Load LONGTEXT only for the final candidates to avoid carrying it through UNION and ORDER BY.
    const idsByIndex = new Map<string, number[]>()
    for (const candidate of candidateRecords) {
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
              FROM ${sql.identifier(tableName)}
              WHERE id IN (${idsSqlList(ids)})`
        ]
      }),
      sql` UNION ALL `
    )
    const [loadedRecords]: SearchRecord[][] = (await this.db.execute(recordsQuery)) as MySqlQueryResult
    const recordsByKey = new Map(loadedRecords.map((record) => [`${record.sourceIndex}:${record.id}`, record]))
    const records = candidateRecords.flatMap((candidate) => {
      const record = recordsByKey.get(`${candidate.sourceIndex}:${candidate.id}`)
      return record ? [{ ...record, score: candidate.score }] : []
    })

    const termsHighlightRegexp = new RegExp(`(${FilesContentStoreMySQL.genFullTextHighlightPattern(positiveTerms)})`, 'giu')
    for (const r of records) {
      r.matches = FilesContentStoreMySQL.extractHighlightedMatches(r.content, termsHighlightRegexp)
      // Do not expose the full indexed content in search results.
      r.content = undefined
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
    for (const i of await this.indexesList()) {
      await this.dropIndex(i)
    }
  }

  private static normalizeFullTextSearch(search: string): string {
    const searchWithQuotedCompounds = this.quoteUnquotedFullTextCompoundTerms(search)
    let normalizedSearch = ''
    let quoted = false
    for (let index = 0; index < searchWithQuotedCompounds.length; index++) {
      const character = searchWithQuotedCompounds[index]
      if (character === '"') {
        quoted = !quoted
        normalizedSearch += character
        continue
      }
      if (!quoted && this.INVALID_TRAILING_FULL_TEXT_OPERATORS.has(character)) {
        let operatorEnd = index + 1
        while (this.INVALID_TRAILING_FULL_TEXT_OPERATORS.has(searchWithQuotedCompounds[operatorEnd])) {
          operatorEnd++
        }
        const previousCharacter = searchWithQuotedCompounds[index - 1]
        const isLeadingOperator = index === 0 || previousCharacter === '(' || this.FULL_TEXT_WHITESPACE_PATTERN.test(previousCharacter)
        const nextCodePoint = searchWithQuotedCompounds.codePointAt(operatorEnd)
        const nextCharacter = nextCodePoint === undefined ? undefined : String.fromCodePoint(nextCodePoint)
        const hasValidTarget =
          nextCharacter !== undefined &&
          (this.FULL_TEXT_TERM_CHARACTER_PATTERN.test(nextCharacter) || (isLeadingOperator && (nextCharacter === '(' || nextCharacter === '"')))
        if (!hasValidTarget) {
          index = operatorEnd - 1
          continue
        }
        normalizedSearch += isLeadingOperator ? character : searchWithQuotedCompounds.slice(index, operatorEnd)
        index = operatorEnd - 1
        continue
      }
      normalizedSearch += character
    }
    return normalizedSearch
  }

  private static quoteUnquotedFullTextCompoundTerms(search: string): string {
    let normalizedSearch = ''
    let quoted = false
    let segmentStart = 0
    for (let index = 0; index < search.length; index++) {
      if (search[index] !== '"') continue
      const segment = search.slice(segmentStart, index)
      normalizedSearch += quoted ? segment : segment.replace(this.FULL_TEXT_COMPOUND_TERM_PATTERN, '$1$2"$3"')
      normalizedSearch += '"'
      quoted = !quoted
      segmentStart = index + 1
    }
    const segment = search.slice(segmentStart)
    return normalizedSearch + (quoted ? segment : segment.replace(this.FULL_TEXT_COMPOUND_TERM_PATTERN, '$1$2"$3"'))
  }

  private static genFullTextHighlightPattern(terms: FilesSearchTerm[]): string {
    const termStart = `(?:${HIGHLIGHT_TERM_START}|${likeSearchTermStartPattern()})`
    const patterns = terms.map(({ rawValue, regexpValue, requiresLike, wildcard }) => {
      const tokens = rawValue.match(this.FULL_TEXT_TERM_TOKEN_PATTERN) || []
      const termPattern = tokens.length
        ? tokens.map((token) => genTermsPattern([token])).join(`${HIGHLIGHT_CONTEXT_SEPARATOR}+`)
        : genTermsPattern([regexpValue])
      return `${termStart}${termPattern}${requiresLike || wildcard ? '' : HIGHLIGHT_TERM_END}`
    })
    return [...new Set(patterns)].sort((left, right) => right.length - left.length).join('|')
  }

  private static extractHighlightedMatches(content: string, termsRegexp: RegExp): string[] {
    const maxSortedList = new MaxSortedList<HighlightContext>(5)
    let previousContextEnd = 0
    termsRegexp.lastIndex = 0
    let match = termsRegexp.exec(content)
    while (match !== null) {
      const contextStart = Math.max(this.findHighlightContextStart(content, match.index), previousContextEnd)
      let contextEnd = this.findHighlightContextEnd(content, match.index + match[0].length)
      const matches: HighlightMatch[] = [{ index: match.index, value: match[0] }]
      const distinctTerms = new Set([match[0].toLowerCase()])

      let nextMatch = termsRegexp.exec(content)
      while (nextMatch !== null && nextMatch.index < contextEnd) {
        matches.push({ index: nextMatch.index, value: nextMatch[0] })
        distinctTerms.add(nextMatch[0].toLowerCase())
        contextEnd = Math.max(contextEnd, nextMatch.index + nextMatch[0].length)
        nextMatch = termsRegexp.exec(content)
      }
      const score = distinctTerms.size * 1000 + Math.min(matches.length, 999)
      maxSortedList.insert([score, { start: contextStart, end: contextEnd, matches }])
      previousContextEnd = contextEnd
      match = nextMatch
    }
    termsRegexp.lastIndex = 0
    return maxSortedList.data.map(([_score, context]) => this.renderHighlightedContext(content, context))
  }

  private static renderHighlightedContext(content: string, context: HighlightContext): string {
    const highlightedParts: string[] = []
    let cursor = context.start
    for (const match of context.matches) {
      highlightedParts.push(content.slice(cursor, match.index), '<mark>', match.value, '</mark>')
      cursor = match.index + match.value.length
    }
    highlightedParts.push(content.slice(cursor, context.end))
    return highlightedParts.join('')
  }

  private static findHighlightContextStart(content: string, matchStart: number): number {
    if (matchStart === 0) return 0
    const previousIndex = this.previousCharacterIndex(content, matchStart)
    if (this.isHighlightWordCharacterAt(content, previousIndex)) return matchStart

    const minIndex = Math.max(0, matchStart - HIGHLIGHT_CONTEXT_CHARS_BEFORE)
    let index = matchStart
    let insideWord = false
    let words = 0
    while (index > minIndex) {
      const characterIndex = this.previousCharacterIndex(content, index)
      const isWordCharacter = this.isHighlightWordCharacterAt(content, characterIndex)
      if (!isWordCharacter && insideWord && ++words === HIGHLIGHT_CONTEXT_WORDS_BEFORE) break
      index = characterIndex
      insideWord = isWordCharacter
    }
    return index
  }

  private static findHighlightContextEnd(content: string, matchEnd: number): number {
    const maxIndex = Math.min(content.length, matchEnd + HIGHLIGHT_CONTEXT_CHARS_AFTER)
    let index = matchEnd
    let insideWord = matchEnd > 0 && this.isHighlightWordCharacterAt(content, this.previousCharacterIndex(content, matchEnd))
    let words = 0
    while (index < maxIndex) {
      const characterEnd = this.nextCharacterIndex(content, index)
      const isWordCharacter = this.isHighlightWordCharacterAt(content, index)
      if (isWordCharacter && !insideWord) {
        if (words === HIGHLIGHT_CONTEXT_WORDS_AFTER) break
        words++
      }
      index = characterEnd
      insideWord = isWordCharacter
    }
    return index
  }

  private static previousCharacterIndex(value: string, index: number): number {
    const characterIndex = index - 1
    if (characterIndex === 0) return 0
    const character = value.charCodeAt(characterIndex)
    const previousCharacter = value.charCodeAt(characterIndex - 1)
    return character >= 0xdc00 && character <= 0xdfff && previousCharacter >= 0xd800 && previousCharacter <= 0xdbff
      ? characterIndex - 1
      : characterIndex
  }

  private static nextCharacterIndex(value: string, index: number): number {
    const codePoint = value.codePointAt(index)
    return index + (codePoint !== undefined && codePoint > 0xffff ? 2 : 1)
  }

  private static isHighlightWordCharacterAt(value: string, index: number): boolean {
    const codeUnit = value.charCodeAt(index)
    if (codeUnit <= 0x7f) {
      return (codeUnit >= 0x30 && codeUnit <= 0x39) || (codeUnit >= 0x41 && codeUnit <= 0x5a) || (codeUnit >= 0x61 && codeUnit <= 0x7a)
    }
    HIGHLIGHT_UNICODE_WORD_CHARACTER_PATTERN.lastIndex = index
    return HIGHLIGHT_UNICODE_WORD_CHARACTER_PATTERN.test(value)
  }

  private async getIndexes(): Promise<Record<string, string>[]> {
    return (await this.db.execute(sql`SHOW TABLES LIKE ${`${FILES_CONTENT_TABLE_PREFIX}%`}`))[0] as any
  }

  private async ensureRunIdColumn(tableName: string): Promise<void> {
    // migration for old versions of the application
    const [columns] = (await this.db.execute(sql`SHOW COLUMNS FROM ${sql.identifier(tableName)} LIKE 'seen_run_id'`)) as MySqlQueryResult
    if ((columns as unknown[]).length) {
      return
    }
    await this.db.execute(sql`ALTER TABLE ${sql.identifier(tableName)} ADD COLUMN seen_run_id varchar(64), ADD INDEX seen_run_id (seen_run_id)`)
  }
}

function toLikePattern(term: string): string {
  return `%${term.replaceAll('=', '==').replaceAll('%', '=%').replaceAll('_', '=_')}%`
}

function createContentMatch(terms: FilesSearchTerm[], separator: ' AND ' | ' OR ', negate = false): SQL | null {
  if (!terms.length) return null
  return sql.join(
    terms.map(({ rawValue }) =>
      negate ? sql`content NOT LIKE ${toLikePattern(rawValue)} ESCAPE '='` : sql`content LIKE ${toLikePattern(rawValue)} ESCAPE '='`
    ),
    separator === ' AND ' ? sql` AND ` : sql` OR `
  )
}

function idsSqlList(ids: number[]): SQL {
  return sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `
  )
}
