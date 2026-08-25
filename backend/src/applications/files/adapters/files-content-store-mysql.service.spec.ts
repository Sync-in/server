import { Test, TestingModule } from '@nestjs/testing'
import { MySqlDialect } from 'drizzle-orm/mysql-core'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants'
import { FilesContentStoreMySQL } from './files-content-store-mysql.service'
import { Mock } from 'vitest'

describe(FilesContentStoreMySQL.name, () => {
  let module: TestingModule
  let filesIndexerMySQL: FilesContentStoreMySQL
  let db: { execute: Mock }
  const dialect = new MySqlDialect()

  const sqlText = (query: any): string => {
    if (typeof query === 'string') return query
    if (Array.isArray(query)) return query.map(sqlText).join('')
    if (Array.isArray(query?.value)) return query.value.join('')
    if (Array.isArray(query?.queryChunks)) return query.queryChunks.map(sqlText).join('')
    return ''
  }

  const mockSingleSearchRecord = (content: string): void => {
    const id = 1
    const sourceIndex = 'files_content_u_1'
    db.execute
      .mockResolvedValueOnce([[{ id, sourceIndex, score: 1 }]])
      .mockResolvedValueOnce([[{ id, sourceIndex, path: '/docs', name: 'document.txt', mime: 'text/plain', mtime: 1730000000000, content }]])
  }

  beforeAll(async () => {
    db = { execute: vi.fn() }

    module = await Test.createTestingModule({
      providers: [FilesContentStoreMySQL, { provide: DB_TOKEN_PROVIDER, useValue: db }]
    }).compile()

    module.useLogger(['fatal'])
    filesIndexerMySQL = module.get<FilesContentStoreMySQL>(FilesContentStoreMySQL)
  })

  afterAll(async () => {
    await module.close()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should be defined', () => {
    expect(filesIndexerMySQL).toBeDefined()
  })

  describe('indexesList', () => {
    it('should list only managed content index tables', async () => {
      db.execute.mockResolvedValueOnce([[{ t: 'files_content_user_1' }, { t: 'filesXcontentYuser_2' }]])

      const res = await filesIndexerMySQL.indexesList()
      expect(res).toEqual(['files_content_user_1'])
      expect(db.execute).toHaveBeenCalledTimes(1)
    })
  })

  describe('getIndexName', () => {
    it('should build table name with prefix', () => {
      expect(filesIndexerMySQL.getIndexName('user_123')).toBe('files_content_user_123')
    })
  })

  describe('existingIndexes', () => {
    it('should filter suffixes to existing tables', async () => {
      db.execute.mockResolvedValueOnce([[{ t: 'files_content_user_1' }, { t: 'files_content_space_2' }]])
      const res = await filesIndexerMySQL.existingIndexes(['user_1', 'space_3', 'space_2'])
      expect(res.sort()).toEqual(['files_content_space_2', 'files_content_user_1'].sort())
    })
  })

  describe('createIndex', () => {
    it('should escape the table name as an identifier', async () => {
      db.execute.mockResolvedValueOnce([{}])
      db.execute.mockResolvedValueOnce([[{ Field: 'seen_run_id' }]])
      const tableName = 'files_content_user_1`; DROP TABLE users; --'

      await expect(filesIndexerMySQL.createIndex(tableName)).resolves.toBe(true)

      const query = dialect.sqlToQuery(db.execute.mock.calls[0][0])
      expect(query.sql).toContain('CREATE TABLE IF NOT EXISTS `files_content_user_1``; DROP TABLE users; --`')
    })

    it('should return true when creation succeeds', async () => {
      db.execute.mockResolvedValueOnce([{}])
      db.execute.mockResolvedValueOnce([[{ Field: 'seen_run_id' }]])
      await expect(filesIndexerMySQL.createIndex('files_content_u_1')).resolves.toBe(true)
      expect(db.execute).toHaveBeenCalledTimes(2)
    })

    it('should add run id column when it is missing', async () => {
      db.execute.mockResolvedValueOnce([{}])
      db.execute.mockResolvedValueOnce([[]])
      db.execute.mockResolvedValueOnce([{}])

      await expect(filesIndexerMySQL.createIndex('files_content_u_1')).resolves.toBe(true)
      expect(db.execute).toHaveBeenCalledTimes(3)
    })

    it('should return false when creation fails', async () => {
      db.execute.mockRejectedValueOnce(new Error('boom'))
      await expect(filesIndexerMySQL.createIndex('files_content_u_1')).resolves.toBe(false)
    })
  })

  describe('dropIndex', () => {
    it('should reject unmanaged table names', async () => {
      await expect(filesIndexerMySQL.dropIndex('filesXcontentYuser_2')).resolves.toBe(false)
      expect(db.execute).not.toHaveBeenCalled()
    })

    it('should return true when drop succeeds', async () => {
      db.execute.mockResolvedValueOnce([{}])
      await expect(filesIndexerMySQL.dropIndex('files_content_user_1')).resolves.toBe(true)
      expect(db.execute).toHaveBeenCalledTimes(1)
    })

    it('should return false when drop fails', async () => {
      db.execute.mockRejectedValueOnce(new Error('boom'))
      await expect(filesIndexerMySQL.dropIndex('files_content_user_1')).resolves.toBe(false)
    })
  })

  describe('insertRecord', () => {
    it('should insert or update a record without throwing', async () => {
      db.execute.mockResolvedValueOnce([{}])
      await expect(
        filesIndexerMySQL.insertRecord(
          'files_content_u_1',
          {
            id: 42,
            path: '/docs',
            name: 'file.txt',
            mime: 'text/plain',
            size: 12,
            mtime: 1730000000000,
            content: 'hello world'
          },
          'run-1'
        )
      ).resolves.toBe(true)
      expect(db.execute).toHaveBeenCalledTimes(1)
    })

    it('should catch and log errors', async () => {
      db.execute.mockRejectedValueOnce(new Error('insert failed'))
      await expect(
        filesIndexerMySQL.insertRecord(
          'files_content_u_1',
          {
            id: 1,
            path: '/',
            name: 'a',
            mime: 'text/plain',
            size: 1,
            mtime: Date.now(),
            content: 'x'
          },
          'run-1'
        )
      ).resolves.toBe(false)
      expect(db.execute).toHaveBeenCalledTimes(1)
    })
  })

  describe('getRecordMetadataByIds', () => {
    it('should return an empty map without querying when there are no ids', async () => {
      const map = await filesIndexerMySQL.getRecordMetadataByIds('files_content_u_1', [])
      expect(map.size).toBe(0)
      expect(db.execute).toHaveBeenCalledTimes(0)
    })

    it('should return a map of id to basic stats for ids', async () => {
      db.execute.mockResolvedValueOnce([[{ id: 1, path: '/a', name: 'a.txt', size: 10 }]])

      const map = await filesIndexerMySQL.getRecordMetadataByIds('files_content_u_1', [1])
      expect(map.get(1)).toEqual({ path: '/a', name: 'a.txt', size: 10 })
      expect(db.execute).toHaveBeenCalledTimes(1)
    })
  })

  describe('markRecordsSeen', () => {
    it('should not query when no ids are provided', async () => {
      await expect(filesIndexerMySQL.markRecordsSeen('files_content_u_1', [], 'run-1')).resolves.toBe(true)
      expect(db.execute).toHaveBeenCalledTimes(0)
    })

    it('should update seen_run_id for ids', async () => {
      db.execute.mockResolvedValueOnce([{}])
      await expect(filesIndexerMySQL.markRecordsSeen('files_content_u_1', [1, 2], 'run-1')).resolves.toBe(true)
      expect(db.execute).toHaveBeenCalledTimes(1)
    })

    it('should return false when update fails', async () => {
      db.execute.mockRejectedValueOnce(new Error('update failed'))
      await expect(filesIndexerMySQL.markRecordsSeen('files_content_u_1', [1, 2], 'run-1')).resolves.toBe(false)
      expect(db.execute).toHaveBeenCalledTimes(1)
    })
  })

  describe('deleteRecords', () => {
    it('should delete ids and warn if affectedRows mismatch', async () => {
      db.execute.mockResolvedValueOnce([{ affectedRows: 1 }]) // ask delete 2 but only 1 deleted
      await filesIndexerMySQL.deleteRecords('files_content_u_1', [1, 2])
      expect(db.execute).toHaveBeenCalledTimes(1)
    })

    it('should not warn when all requested ids are deleted', async () => {
      const warnSpy = vi.spyOn(filesIndexerMySQL['logger'], 'warn').mockImplementation(() => undefined)
      db.execute.mockResolvedValueOnce([{ affectedRows: 2 }])

      await filesIndexerMySQL.deleteRecords('files_content_u_1', [1, 2])

      expect(db.execute).toHaveBeenCalledTimes(1)
      expect(warnSpy).not.toHaveBeenCalled()
      warnSpy.mockRestore()
    })

    it('should catch errors', async () => {
      db.execute.mockRejectedValueOnce(new Error('delete failed'))
      await filesIndexerMySQL.deleteRecords('files_content_u_1', [1])
      expect(db.execute).toHaveBeenCalledTimes(1)
    })
  })

  describe('deleteUnseenRecords', () => {
    it('should delete records not seen in the current run', async () => {
      db.execute.mockResolvedValueOnce([{ affectedRows: 2 }])
      await expect(filesIndexerMySQL.deleteUnseenRecords('files_content_u_1', 'run-1')).resolves.toBe(2)
      expect(db.execute).toHaveBeenCalledTimes(1)
    })

    it('should catch errors', async () => {
      db.execute.mockRejectedValueOnce(new Error('delete failed'))
      await expect(filesIndexerMySQL.deleteUnseenRecords('files_content_u_1', 'run-1')).resolves.toBe(0)
      expect(db.execute).toHaveBeenCalledTimes(1)
    })
  })

  describe('searchRecords', () => {
    it('should return empty array when no terms', async () => {
      const res = await filesIndexerMySQL.searchRecords(['files_content_u_1'], '   ', 10)
      expect(res).toEqual([])
      expect(db.execute).toHaveBeenCalledTimes(0)
    })

    it('should return empty array when DB returns no records', async () => {
      db.execute.mockResolvedValueOnce([[]])

      const res = await filesIndexerMySQL.searchRecords(['files_content_u_1'], 'foo', 10)

      expect(db.execute).toHaveBeenCalledTimes(1)
      const query = sqlText(db.execute.mock.calls[0][0])
      expect(query).toContain('SELECT')
      expect(query).not.toContain('path')
      expect(query).not.toContain('content,')
      expect(query).toContain('MATCH (content)')
      expect(query).not.toContain('content LIKE')
      expect(res).toEqual([])
    })

    it('should remove trailing boolean operators before querying FULLTEXT', async () => {
      db.execute.mockResolvedValueOnce([[]])

      await filesIndexerMySQL.searchRecords(['files_content_u_1'], '+required optional+ excluded- "C++ guide"', 10)

      const query = dialect.sqlToQuery(db.execute.mock.calls[0][0])
      expect(query.params).toContain('+required optional excluded "C++ guide"')
      expect(query.params).not.toContain('+required optional+ excluded- "C++ guide"')
    })

    it.each([
      ['report -set-variable', 'report -"set-variable"'],
      ['2017-03-05', '"2017-03-05"'],
      ['contact@financo.fr', '"contact@financo.fr"'],
      ['"configure set-variable now"', '"configure set-variable now"'],
      ['test+,', 'test,']
    ])('should normalize the FULLTEXT search %s as %s', async (search, normalizedSearch) => {
      db.execute.mockResolvedValueOnce([[]])

      await filesIndexerMySQL.searchRecords(['files_content_u_1'], search, 10)

      const query = dialect.sqlToQuery(db.execute.mock.calls[0][0])
      expect(query.params.filter((param) => param === normalizedSearch)).toHaveLength(2)
    })

    it('should use only LIKE when a mixed search contains CJK', async () => {
      db.execute.mockResolvedValueOnce([[]])

      await filesIndexerMySQL.searchRecords(['files_content_u_1'], 'report 中文', 10)

      const query = sqlText(db.execute.mock.calls[0][0])
      expect(query).toContain('WHERE (content LIKE')
      expect(query).not.toContain('MATCH (content)')
    })

    it('should translate required, optional and excluded CJK terms', async () => {
      db.execute.mockResolvedValue([[]])

      await filesIndexerMySQL.searchRecords(['files_content_u_1'], '+中文 +文档 -秘密', 10)
      await filesIndexerMySQL.searchRecords(['files_content_u_1'], '中文 文档', 10)

      const requiredQuery = sqlText(db.execute.mock.calls[0][0])
      const optionalQuery = sqlText(db.execute.mock.calls[1][0])
      expect(requiredQuery).toContain('WHERE (content LIKE')
      expect(requiredQuery).toContain("ESCAPE '=' AND content LIKE")
      expect(requiredQuery).toContain('content NOT LIKE')
      expect(optionalQuery).toContain("ESCAPE '=' OR content LIKE")
    })

    it('should load final content across indexes, preserve score order, and highlight matches', async () => {
      const rows = [
        {
          id: 3,
          path: '/docs',
          name: 'alpha.txt',
          mime: 'text/plain',
          mtime: 1730000000000,
          content: 'Alpha foo bar. Something about Foo again; BAR appears too.',
          score: 10
        },
        {
          id: 3,
          path: '/docs',
          name: 'beta.txt',
          mime: 'text/plain',
          mtime: 1730000000001,
          content: 'Nothing to see here except foo once.',
          score: 5
        }
      ]
      db.execute.mockResolvedValueOnce([
        [
          { id: 3, sourceIndex: 'files_content_u_1', score: 10 },
          { id: 3, sourceIndex: 'files_content_s_2', score: 5 }
        ]
      ])
      db.execute.mockResolvedValueOnce([
        [
          { ...rows[1], sourceIndex: 'files_content_s_2' },
          { ...rows[0], sourceIndex: 'files_content_u_1' }
        ]
      ])

      const res = await filesIndexerMySQL.searchRecords(['files_content_u_1', 'files_content_s_2'], 'foo bar', 10)

      expect(db.execute).toHaveBeenCalledTimes(2)
      const candidatesQuery = sqlText(db.execute.mock.calls[0][0])
      const recordsQuery = sqlText(db.execute.mock.calls[1][0])
      expect(candidatesQuery).not.toContain('path')
      expect(candidatesQuery).not.toContain('content,')
      expect(recordsQuery).toContain('path')
      expect(recordsQuery).toContain('content')
      expect(res.length).toBe(2)
      expect(res.map(({ name, score }) => [name, score])).toEqual([
        ['alpha.txt', 10],
        ['beta.txt', 5]
      ])
      expect(res[0].content).toBeUndefined()
      expect(Array.isArray(res[0].matches)).toBe(true)
      expect(res[0].matches!.length).toBeGreaterThan(0)
      expect(res[0].matches!.join(' ')).toMatch(/<mark>foo<\/mark>|<mark>bar<\/mark>/i)
    })

    it('should highlight CJK content returned by the fallback search', async () => {
      mockSingleSearchRecord('これは日本語の文書です。')

      const res = await filesIndexerMySQL.searchRecords(['files_content_u_1'], '日本語', 10)

      expect(db.execute).toHaveBeenCalledTimes(2)
      expect(res[0].content).toBeUndefined()
      expect(res[0].matches).toEqual(['<mark>日本語</mark>の文書です。'])
    })

    it('should highlight a tokenized compound before its shorter alternative', async () => {
      mockSingleSearchRecord('The command can set variable values.')

      const res = await filesIndexerMySQL.searchRecords(['files_content_u_1'], 'set set-variable', 10)

      expect(res[0].matches).toEqual(['The command can <mark>set variable</mark> values.'])
    })

    it('should bound the highlighted context around a match', async () => {
      const before = Array.from({ length: 12 }, (_, index) => `before${index}`).join(' ')
      const after = Array.from({ length: 17 }, (_, index) => `after${index}`).join(' ')
      mockSingleSearchRecord(`${before} target ${after}.`)

      const res = await filesIndexerMySQL.searchRecords(['files_content_u_1'], 'target', 10)
      const [match] = res[0].matches

      expect(match).toMatch(/^before2 /)
      expect(match).toContain('<mark>target</mark>')
      expect(match).toContain('after14')
      expect(match).not.toContain('after15')
    })

    it('should highlight every occurrence inside one context', async () => {
      mockSingleSearchRecord('target target target')

      const res = await filesIndexerMySQL.searchRecords(['files_content_u_1'], 'target', 10)

      expect(res[0].matches).toEqual(['<mark>target</mark> <mark>target</mark> <mark>target</mark>'])
    })

    it('should highlight the FULLTEXT token when trailing operators precede punctuation', async () => {
      mockSingleSearchRecord('The test is available.')

      const res = await filesIndexerMySQL.searchRecords(['files_content_u_1'], 'test+,', 10)

      expect(res[0].matches).toEqual(['The <mark>test</mark> is available.'])
    })

    it('should highlight an unaccented match from an accented search', async () => {
      mockSingleSearchRecord('Le resume final est disponible.')

      const res = await filesIndexerMySQL.searchRecords(['files_content_u_1'], 'résumé', 10)

      expect(res[0].matches).toEqual(['Le <mark>resume</mark> final est disponible.'])
    })

    it('should highlight a Unicode term containing combining marks', async () => {
      mockSingleSearchRecord('यह खाते का विवरण है।')

      const res = await filesIndexerMySQL.searchRecords(['files_content_u_1'], 'खाते', 10)

      expect(res[0].matches[0]).toContain('<mark>खाते</mark>')
    })

    it.each([
      ['set', '<mark>set</mark> value', '<mark>set</mark>ting'],
      ['set*', '<mark>set</mark>ting', null]
    ] as const)('should respect the FULLTEXT wildcard boundary for %s', async (search, highlightedTerm, rejectedHighlight) => {
      mockSingleSearchRecord('A setting followed by a set value.')

      const res = await filesIndexerMySQL.searchRecords(['files_content_u_1'], search, 10)
      const matches = res[0].matches.join(' ')

      expect(matches).toContain(highlightedTerm)
      if (rejectedHighlight) {
        expect(matches).not.toContain(rejectedHighlight)
      }
    })
  })

  describe('cleanIndexes', () => {
    it('should drop tables that are not in provided suffixes', async () => {
      // existing tables
      db.execute.mockResolvedValueOnce([[{ t: 'files_content_user_1' }, { t: 'files_content_user_2' }, { t: 'files_content_space_1' }]])
      // each drop returns something
      db.execute.mockResolvedValue([{}])

      await filesIndexerMySQL.cleanIndexes(['user_1']) // keep only files_content_user_1; drop the other managed indexes

      // 1 call for indexesList + 2 drops expected
      expect(db.execute).toHaveBeenCalledTimes(3)
    })

    it('should do nothing when no suffixes provided', async () => {
      await filesIndexerMySQL.cleanIndexes([])
      expect(db.execute).toHaveBeenCalledTimes(0)
    })
  })
})
