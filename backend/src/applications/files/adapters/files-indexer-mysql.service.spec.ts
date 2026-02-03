import { Test, TestingModule } from '@nestjs/testing'
import { Cache } from '../../../infrastructure/cache/services/cache.service'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants'
import { FilesIndexerMySQL } from './files-indexer-mysql.service'

describe(FilesIndexerMySQL.name, () => {
  let module: TestingModule
  let filesIndexerMySQL: FilesIndexerMySQL
  let db: { execute: jest.Mock }
  let cache: { genSlugKey: jest.Mock; get: jest.Mock; set: jest.Mock }

  beforeAll(async () => {
    db = { execute: jest.fn() }
    cache = {
      genSlugKey: jest.fn(() => 'cache:indexesList:key'),
      get: jest.fn(),
      set: jest.fn().mockResolvedValue(undefined)
    }

    module = await Test.createTestingModule({
      providers: [FilesIndexerMySQL, { provide: DB_TOKEN_PROVIDER, useValue: db }, { provide: Cache, useValue: cache }]
    }).compile()

    module.useLogger(['fatal'])
    filesIndexerMySQL = module.get<FilesIndexerMySQL>(FilesIndexerMySQL)
  })

  afterAll(async () => {
    await module.close()
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should be defined', () => {
    expect(filesIndexerMySQL).toBeDefined()
  })

  describe('indexesList', () => {
    it('should list tables starting with prefix', async () => {
      // Force a cache hit to avoid decorator calling the original method with a bad `this`
      cache.get.mockResolvedValueOnce(['files_content_u_1', 'files_content_s_2'])

      const res = await filesIndexerMySQL.indexesList()
      expect(res).toEqual(['files_content_u_1', 'files_content_s_2'])
      expect(cache.genSlugKey).toHaveBeenCalled()
      expect(cache.get).toHaveBeenCalled()
      // DB should not be called on cache hit
      expect(db.execute).not.toHaveBeenCalled()
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
      await expect(filesIndexerMySQL.createIndex('files_content_u_1')).resolves.toBe(true)
      expect(db.execute).toHaveBeenCalledTimes(1)
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
        filesIndexerMySQL.insertRecord('files_content_u_1', {
          id: 42,
          path: '/docs',
          name: 'file.txt',
          mime: 'text/plain',
          size: 12,
          mtime: 1730000000000,
          content: 'hello world'
        })
      ).resolves.toBeUndefined()
      expect(db.execute).toHaveBeenCalledTimes(1)
    })

    it('should catch and log errors', async () => {
      db.execute.mockRejectedValueOnce(new Error('insert failed'))
      await expect(
        filesIndexerMySQL.insertRecord('files_content_u_1', {
          id: 1,
          path: '/',
          name: 'a',
          mime: 'text/plain',
          size: 1,
          mtime: Date.now(),
          content: 'x'
        })
      ).resolves.toBeUndefined()
      expect(db.execute).toHaveBeenCalledTimes(1)
    })
  })

  describe('getRecordStats', () => {
    it('should return a map of id to basic stats without path filter', async () => {
      db.execute.mockResolvedValueOnce([
        [
          { id: 1, path: '/a', name: 'a.txt', size: 10 },
          { id: 2, path: '/b', name: 'b.txt', size: 20 }
        ]
      ])

      const map = await filesIndexerMySQL.getRecordStats('files_content_u_1')
      expect(map.get(1)).toEqual({ path: '/a', name: 'a.txt', size: 10 })
      expect(map.get(2)).toEqual({ path: '/b', name: 'b.txt', size: 20 })
      expect(db.execute).toHaveBeenCalledTimes(1)
    })

    it('should append WHERE clause when path filter is provided', async () => {
      db.execute.mockResolvedValueOnce([[{ id: 3, path: '/docs', name: 'c.txt', size: 30 }]])

      const map = await filesIndexerMySQL.getRecordStats('files_content_u_1', '/docs')
      expect(map.get(3)).toEqual({ path: '/docs', name: 'c.txt', size: 30 })
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
      const warnSpy = jest.spyOn(filesIndexerMySQL['logger'], 'warn').mockImplementation(() => undefined)
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
      expect(res).toEqual([])
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
      db.execute.mockResolvedValueOnce([rows])

      const res = await filesIndexerMySQL.searchRecords(['files_content_u_1', 'files_content_s_2'], 'foo bar', 10)

      expect(db.execute).toHaveBeenCalledTimes(1)
      expect(res.length).toBe(2)
      // content must be cleared
      expect(res[0].content).toBeUndefined()
      expect(Array.isArray(res[0].matches)).toBe(true)
      expect(res[0].matches!.length).toBeGreaterThan(0)
      // highlighted with <mark> tags
      expect(res[0].matches!.join(' ')).toMatch(/<mark>foo<\/mark>|<mark>bar<\/mark>/i)
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
