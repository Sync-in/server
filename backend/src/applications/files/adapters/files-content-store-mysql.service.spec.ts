import { Test, TestingModule } from '@nestjs/testing'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants'
import { FilesContentStoreMySQL } from './files-content-store-mysql.service'
import { Mock } from 'vitest'

describe(FilesContentStoreMySQL.name, () => {
  let module: TestingModule
  let filesIndexerMySQL: FilesContentStoreMySQL
  let db: { execute: Mock }

  const sqlText = (query: any): string => {
    if (typeof query === 'string') return query
    if (Array.isArray(query)) return query.map(sqlText).join('')
    if (Array.isArray(query?.value)) return query.value.join('')
    if (Array.isArray(query?.queryChunks)) return query.queryChunks.map(sqlText).join('')
    return ''
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
    it('should list tables starting with prefix', async () => {
      db.execute.mockResolvedValueOnce([[{ t: 'files_content_u_1' }, { t: 'files_content_s_2' }]])

      const res = await filesIndexerMySQL.indexesList()
      expect(res).toEqual(['files_content_u_1', 'files_content_s_2'])
      expect(db.execute).toHaveBeenCalledTimes(1)
    })
  })

  describe('getIndexName', () => {
    it('should build table name with prefix', () => {
      expect(filesIndexerMySQL.getIndexName('u_123')).toBe('files_content_u_123')
    })
  })

  describe('existingIndexes', () => {
    it('should filter suffixes to existing tables', async () => {
      db.execute.mockResolvedValueOnce([[{ t: 'files_content_u_1' }, { t: 'files_content_s_2' }]])
      const res = await filesIndexerMySQL.existingIndexes(['u_1', 's_3', 's_2'])
      expect(res.sort()).toEqual(['files_content_s_2', 'files_content_u_1'].sort())
    })
  })

  describe('createIndex', () => {
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
    it('should return true when drop succeeds', async () => {
      db.execute.mockResolvedValueOnce([{}])
      await expect(filesIndexerMySQL.dropIndex('files_content_u_1')).resolves.toBe(true)
      expect(db.execute).toHaveBeenCalledTimes(1)
    })

    it('should return false when drop fails', async () => {
      db.execute.mockRejectedValueOnce(new Error('boom'))
      await expect(filesIndexerMySQL.dropIndex('files_content_u_1')).resolves.toBe(false)
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

    it('should use only LIKE for a CJK-only search', async () => {
      db.execute.mockResolvedValueOnce([[]])

      await filesIndexerMySQL.searchRecords(['files_content_u_1'], '中文', 10)

      const query = sqlText(db.execute.mock.calls[0][0])
      expect(query).toContain('content LIKE')
      expect(query).not.toContain('MATCH (content)')
    })

    it('should use LIKE for non-segmented scripts and MATCH for Devanagari', async () => {
      db.execute.mockResolvedValue([[]])

      await filesIndexerMySQL.searchRecords(['files_content_u_1'], 'ภาษาไทย', 10)
      await filesIndexerMySQL.searchRecords(['files_content_u_1'], 'खाते मिलान', 10)

      const thaiQuery = sqlText(db.execute.mock.calls[0][0])
      const devanagariQuery = sqlText(db.execute.mock.calls[1][0])
      expect(thaiQuery).toContain('content LIKE')
      expect(thaiQuery).not.toContain('MATCH (content)')
      expect(devanagariQuery).toContain('MATCH (content)')
      expect(devanagariQuery).not.toContain('content LIKE')
    })

    it('should use only LIKE when a mixed search contains CJK', async () => {
      db.execute.mockResolvedValueOnce([[]])

      await filesIndexerMySQL.searchRecords(['files_content_u_1'], 'report 中文', 10)

      const query = sqlText(db.execute.mock.calls[0][0])
      expect(query).toContain('WHERE (content LIKE')
      expect(query).not.toContain('MATCH (content)')
    })

    it('should translate required, optional, excluded and exact CJK terms', async () => {
      db.execute.mockResolvedValue([[]])

      await filesIndexerMySQL.searchRecords(['files_content_u_1'], '+中文 +文档 -秘密', 10)
      await filesIndexerMySQL.searchRecords(['files_content_u_1'], '中文 文档', 10)
      await filesIndexerMySQL.searchRecords(['files_content_u_1'], '"中文 文档"', 10)

      const requiredQuery = sqlText(db.execute.mock.calls[0][0])
      const optionalQuery = sqlText(db.execute.mock.calls[1][0])
      const exactPhraseQuery = sqlText(db.execute.mock.calls[2][0])
      expect(requiredQuery).toContain('WHERE (content LIKE')
      expect(requiredQuery).toContain("ESCAPE '=' AND content LIKE")
      expect(requiredQuery).toContain('content NOT LIKE')
      expect(optionalQuery).toContain("ESCAPE '=' OR content LIKE")
      // One LIKE in the score and one in WHERE means the quoted phrase was kept as one term.
      expect(exactPhraseQuery.match(/content LIKE/g)).toHaveLength(2)
    })

    it('should keep identical ids from different indexes with their score order', async () => {
      db.execute.mockResolvedValueOnce([
        [
          { id: 3, sourceIndex: 'files_content_u_1', score: 10 },
          { id: 3, sourceIndex: 'files_content_s_2', score: 5 }
        ]
      ])
      db.execute.mockResolvedValueOnce([
        [
          {
            id: 3,
            sourceIndex: 'files_content_s_2',
            path: '/shared',
            name: 'shared.txt',
            mime: 'text/plain',
            mtime: 1730000000001,
            content: 'foo shared'
          },
          {
            id: 3,
            sourceIndex: 'files_content_u_1',
            path: '/personal',
            name: 'personal.txt',
            mime: 'text/plain',
            mtime: 1730000000000,
            content: 'foo personal'
          }
        ]
      ])

      const res = await filesIndexerMySQL.searchRecords(['files_content_u_1', 'files_content_s_2'], 'foo', 10)

      expect(res).toHaveLength(2)
      expect(res.map(({ name, score }) => [name, score])).toEqual([
        ['personal.txt', 10],
        ['shared.txt', 5]
      ])
    })

    it('should search across tables, sort by score, and highlight matches', async () => {
      // fabricate records returned by DB. Only first array (rows) is used.
      const rows = [
        {
          id: 1,
          path: '/docs',
          name: 'alpha.txt',
          mime: 'text/plain',
          mtime: 1730000000000,
          content: 'Alpha foo bar. Something about Foo again; BAR appears too.',
          score: 10
        },
        {
          id: 2,
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
          { id: 1, sourceIndex: 'files_content_u_1', score: 10 },
          { id: 2, sourceIndex: 'files_content_s_2', score: 5 }
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
      expect(res.map((record) => record.id)).toEqual([1, 2])
      // content must be cleared
      expect(res[0].content).toBeUndefined()
      expect(Array.isArray(res[0].matches)).toBe(true)
      expect(res[0].matches!.length).toBeGreaterThan(0)
      // highlighted with <mark> tags
      expect(res[0].matches!.join(' ')).toMatch(/<mark>foo<\/mark>|<mark>bar<\/mark>/i)
    })

    it('should highlight CJK content returned by the fallback search', async () => {
      db.execute.mockResolvedValueOnce([[{ id: 3, sourceIndex: 'files_content_u_1', score: 1 }]])
      db.execute.mockResolvedValueOnce([
        [
          {
            id: 3,
            sourceIndex: 'files_content_u_1',
            path: '/docs',
            name: '日本語.txt',
            mime: 'text/plain',
            mtime: 1730000000002,
            content: 'これは日本語の文書です。'
          }
        ]
      ])

      const res = await filesIndexerMySQL.searchRecords(['files_content_u_1'], '日本語', 10)

      expect(db.execute).toHaveBeenCalledTimes(2)
      expect(res[0].content).toBeUndefined()
      expect(res[0].matches).toEqual(['<mark>日本語</mark>の文書です。'])
    })

    it('should highlight hyphenated full-text matches', async () => {
      db.execute.mockResolvedValueOnce([[{ id: 4, sourceIndex: 'files_content_u_1', score: 1 }]])
      db.execute.mockResolvedValueOnce([
        [
          {
            id: 4,
            sourceIndex: 'files_content_u_1',
            path: '/docs',
            name: 'euro-office.txt',
            mime: 'text/plain',
            mtime: 1730000000003,
            content: 'Le dossier euro-office est prêt.'
          }
        ]
      ])

      const res = await filesIndexerMySQL.searchRecords(['files_content_u_1'], 'euro-office', 10)

      expect(db.execute).toHaveBeenCalledTimes(2)
      expect(res[0].content).toBeUndefined()
      expect(res[0].matches).toEqual(['Le dossier <mark>euro-office</mark> est prêt.'])
    })
  })

  describe('cleanIndexes', () => {
    it('should drop tables that are not in provided suffixes', async () => {
      // existing tables
      db.execute.mockResolvedValueOnce([[{ t: 'files_content_u_1' }, { t: 'files_content_u_2' }, { t: 'files_content_s_1' }]])
      // each drop returns something
      db.execute.mockResolvedValue([{}])

      await filesIndexerMySQL.cleanIndexes(['u_1']) // keep only files_content_u_1; drop the others

      // 1 call for indexesList + 2 drops expected
      expect(db.execute).toHaveBeenCalledTimes(3)
    })

    it('should do nothing when no suffixes provided', async () => {
      await filesIndexerMySQL.cleanIndexes([])
      expect(db.execute).toHaveBeenCalledTimes(0)
    })
  })
})
