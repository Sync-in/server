import { Test, TestingModule } from '@nestjs/testing'
import fs from 'fs/promises'
import path from 'node:path'
import { Cache } from '../../../infrastructure/cache/services/cache.service'
import { CACHE_INDEXING_UPDATE_PREFIX } from '../constants/indexing'
import { FILE_REPOSITORY } from '../constants/operations'
import { FileParseContext } from '../interfaces/file-parse-index'
import { FilesContentStore } from '../models/files-content-store'
import * as docTextifyModule from '../utils/doc-textify/doc-textify'
import { OCRManager } from '../utils/doc-textify/utils/ocr'
import { FilesParser } from './files-parser.service'
import { FilesContentIndexer } from './files-content-indexer.service'

describe(FilesContentIndexer.name, () => {
  let service: FilesContentIndexer
  let cache: {
    keys: jest.Mock
    del: jest.Mock
  }
  let filesIndexer: {
    getIndexName: jest.Mock
    createIndex: jest.Mock
    getRecordStats: jest.Mock
    insertRecord: jest.Mock
    deleteRecords: jest.Mock
    dropIndex: jest.Mock
    cleanIndexes: jest.Mock
  }
  let filesParser: {
    allPaths: jest.Mock
  }

  const asyncGen = <T>(items: T[]) =>
    (async function* () {
      for (const item of items) {
        yield item
      }
    })()

  beforeEach(async () => {
    cache = {
      keys: jest.fn().mockResolvedValue([]),
      del: jest.fn().mockResolvedValue(true)
    }
    filesIndexer = {
      getIndexName: jest.fn((suffix: string) => `files_content_${suffix}`),
      createIndex: jest.fn().mockResolvedValue(true),
      getRecordStats: jest.fn().mockResolvedValue(new Map()),
      insertRecord: jest.fn().mockResolvedValue(undefined),
      deleteRecords: jest.fn().mockResolvedValue(undefined),
      dropIndex: jest.fn().mockResolvedValue(true),
      cleanIndexes: jest.fn().mockResolvedValue(undefined)
    }
    filesParser = {
      allPaths: jest.fn().mockReturnValue(asyncGen([]))
    }
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesContentIndexer,
        { provide: Cache, useValue: cache },
        { provide: FilesContentStore, useValue: filesIndexer },
        { provide: FilesParser, useValue: filesParser }
      ]
    }).compile()

    module.useLogger(['fatal'])
    service = module.get<FilesContentIndexer>(FilesContentIndexer)
  })

  afterEach(() => {
    jest.restoreAllMocks()
    jest.clearAllMocks()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  it('should aggregate indexing event keys, parse matching entries and clean cache keys', async () => {
    cache.keys.mockResolvedValueOnce([
      `${CACHE_INDEXING_UPDATE_PREFIX}-user-1`,
      `${CACHE_INDEXING_UPDATE_PREFIX}-space-2`,
      `${CACHE_INDEXING_UPDATE_PREFIX}-share-3`,
      `${CACHE_INDEXING_UPDATE_PREFIX}-unknown-9`
    ])
    const parseSpy = jest.spyOn(service, 'parseAndIndexAllFiles').mockResolvedValueOnce(undefined)

    await service.updateIndexEntries()

    expect(parseSpy).toHaveBeenCalledWith([1], [2], [3])
    expect(cache.del).toHaveBeenCalledTimes(4)
    expect(cache.del).toHaveBeenCalledWith(`${CACHE_INDEXING_UPDATE_PREFIX}-user-1`)
    expect(cache.del).toHaveBeenCalledWith(`${CACHE_INDEXING_UPDATE_PREFIX}-space-2`)
    expect(cache.del).toHaveBeenCalledWith(`${CACHE_INDEXING_UPDATE_PREFIX}-share-3`)
    expect(cache.del).toHaveBeenCalledWith(`${CACHE_INDEXING_UPDATE_PREFIX}-unknown-9`)
  })

  it('should only clean keys when no valid indexing repository type is found', async () => {
    cache.keys.mockResolvedValueOnce([`${CACHE_INDEXING_UPDATE_PREFIX}-unknown-10`])
    const parseSpy = jest.spyOn(service, 'parseAndIndexAllFiles').mockResolvedValueOnce(undefined)

    await service.updateIndexEntries()

    expect(parseSpy).not.toHaveBeenCalled()
    expect(cache.del).toHaveBeenCalledWith(`${CACHE_INDEXING_UPDATE_PREFIX}-unknown-10`)
  })

  it('should start and stop OCR manager, index all parser paths and clean stale indexes on full reindex', async () => {
    const ocrManager = {
      worker: null,
      start: jest.fn().mockResolvedValue(null),
      stop: jest.fn().mockResolvedValue(undefined)
    }
    jest.spyOn(OCRManager, 'getInstance').mockReturnValue(ocrManager as any)
    filesParser.allPaths.mockReturnValue(
      asyncGen([
        [1, FILE_REPOSITORY.USER, [{ realPath: '/u/john', pathPrefix: 'files/personal', isDir: true }]],
        [5, FILE_REPOSITORY.SPACE, [{ realPath: '/s/project', pathPrefix: 'files/project', isDir: true }]]
      ] as [number, FILE_REPOSITORY, FileParseContext[]][])
    )
    const indexSpy = jest.spyOn(service as any, 'indexFiles').mockResolvedValue(undefined)

    await service.parseAndIndexAllFiles()

    expect(ocrManager.start).toHaveBeenCalledTimes(1)
    expect(indexSpy).toHaveBeenNthCalledWith(1, 'user_1', [{ realPath: '/u/john', pathPrefix: 'files/personal', isDir: true }])
    expect(indexSpy).toHaveBeenNthCalledWith(2, 'space_5', [{ realPath: '/s/project', pathPrefix: 'files/project', isDir: true }])
    expect(filesIndexer.cleanIndexes).toHaveBeenCalledWith(['user_1', 'space_5'])
    expect(ocrManager.stop).toHaveBeenCalledTimes(1)
  })

  it('should continue parseAndIndexAllFiles when OCR startup fails and skip cleanIndexes for incremental runs', async () => {
    const ocrManager = {
      worker: null,
      start: jest.fn().mockRejectedValue(new Error('ocr init failed')),
      stop: jest.fn().mockResolvedValue(undefined)
    }
    jest.spyOn(OCRManager, 'getInstance').mockReturnValue(ocrManager as any)
    filesParser.allPaths.mockReturnValue(
      asyncGen([[9, FILE_REPOSITORY.USER, [{ realPath: '/u/jane', pathPrefix: 'files/personal', isDir: true }]]] as any)
    )
    jest.spyOn(service as any, 'indexFiles').mockResolvedValue(undefined)

    await service.parseAndIndexAllFiles([9], [], [])

    expect(filesIndexer.cleanIndexes).not.toHaveBeenCalled()
    expect(ocrManager.stop).toHaveBeenCalledTimes(1)
  })

  it('should skip indexFiles when index creation fails', async () => {
    filesIndexer.createIndex.mockResolvedValueOnce(false)

    await (service as any).indexFiles('user_7', [{ realPath: '/u/john', pathPrefix: 'files/personal', isDir: true }])

    expect(filesIndexer.getRecordStats).not.toHaveBeenCalled()
    expect(filesIndexer.insertRecord).not.toHaveBeenCalled()
    expect(filesIndexer.deleteRecords).not.toHaveBeenCalled()
    expect(filesIndexer.dropIndex).not.toHaveBeenCalled()
  })

  it('should drop empty index when there is no db data and no indexed records', async () => {
    filesIndexer.getRecordStats.mockResolvedValueOnce(new Map())
    jest.spyOn(service as any, 'parseFiles').mockReturnValue(asyncGen([]))

    await (service as any).indexFiles('user_8', [{ realPath: '/empty', pathPrefix: 'files/personal', isDir: true }])

    expect(filesIndexer.dropIndex).toHaveBeenCalledWith('files_content_user_8')
  })

  it('should insert parsed records and delete stale entries in indexFiles', async () => {
    filesIndexer.getRecordStats.mockResolvedValueOnce(
      new Map([
        [1, { path: 'files/personal', name: 'old.txt', size: 10 }],
        [2, { path: 'files/personal', name: 'keep.txt', size: 20 }]
      ])
    )
    jest.spyOn(service as any, 'parseFiles').mockImplementation(async function* (_dir: string, context: any) {
      context.fs.add(2)
      context.fs.add(3)
      yield {
        id: 3,
        path: 'files/personal',
        name: 'new.txt',
        mime: 'text-plain',
        size: 30,
        mtime: 1700000000000,
        content: 'indexed'
      }
    })

    await (service as any).indexFiles('user_9', [{ realPath: '/root', pathPrefix: 'files/personal', isDir: true }])

    expect(filesIndexer.insertRecord).toHaveBeenCalledWith(
      'files_content_user_9',
      expect.objectContaining({ id: 3, name: 'new.txt', content: 'indexed' })
    )
    expect(filesIndexer.deleteRecords).toHaveBeenCalledWith('files_content_user_9', [1])
  })

  it('should recursively parse directories and yield file contents only', async () => {
    const readdirSpy = jest.spyOn(fs, 'readdir')
    readdirSpy.mockResolvedValueOnce([
      { parentPath: '/root', name: 'sub', isDirectory: () => true },
      { parentPath: '/root', name: 'a.txt', isDirectory: () => false }
    ] as any)
    readdirSpy.mockResolvedValueOnce([{ parentPath: '/root/sub', name: 'b.txt', isDirectory: () => false }] as any)
    jest.spyOn(service as any, 'analyzeFile').mockImplementation(async (realPath: string) => ({
      id: realPath.length,
      path: 'files/personal',
      name: path.basename(realPath),
      mime: 'text-plain',
      size: 1,
      mtime: 1,
      content: 'ok'
    }))
    const yielded: any[] = []

    for await (const fileContent of (service as any).parseFiles('/root', {
      indexSuffix: 'user_1',
      pathPrefix: 'files/personal',
      regexBasePath: /^\/?root\/?/,
      db: new Map(),
      fs: new Set()
    })) {
      yielded.push(fileContent)
    }

    expect(yielded.map((f) => f.name)).toEqual(['b.txt', 'a.txt'])
  })

  it('should skip non-indexable files and unchanged files in analyzeFile', async () => {
    const statSpy = jest.spyOn(fs, 'stat')
    const context = {
      indexSuffix: 'user_1',
      pathPrefix: 'files/personal',
      regexBasePath: /^\/?data\/?/,
      db: new Map<number, { name: string; path: string; size: number }>([[123, { path: 'files/personal/sub', name: 'doc.txt', size: 12 }]]),
      fs: new Set<number>()
    }

    const unsupported = await (service as any).analyzeFile('/data/image.png', context, false)
    expect(unsupported).toBeNull()
    expect(statSpy).not.toHaveBeenCalled()

    statSpy.mockResolvedValueOnce({
      ino: 123,
      size: 12,
      mtime: new Date('2024-01-01T00:00:00.000Z')
    } as any)
    const unchanged = await (service as any).analyzeFile('/data/sub/doc.txt', context, false)
    expect(unchanged).toBeNull()
    expect(context.fs.has(123)).toBe(true)
  })

  it('should build indexed file content in analyzeFile for changed files', async () => {
    const context = {
      indexSuffix: 'user_1',
      pathPrefix: 'files/personal',
      regexBasePath: /^\/?data\/base\/?/,
      db: new Map<number, { name: string; path: string; size: number }>(),
      fs: new Set<number>()
    }
    jest.spyOn(fs, 'stat').mockResolvedValueOnce({
      ino: 200,
      size: 42,
      mtime: new Date('2024-01-02T03:04:05.000Z')
    } as any)
    jest.spyOn(service as any, 'parseContent').mockResolvedValueOnce('indexed content')

    const fileContent = await (service as any).analyzeFile('/data/base/sub/doc.txt', context, false)

    expect(fileContent).toEqual({
      id: 200,
      path: 'files/personal/sub',
      name: 'doc.txt',
      mime: 'text-plain',
      size: 42,
      mtime: new Date('2024-01-02T03:04:05.000Z').getTime(),
      content: 'indexed content'
    })
    expect(context.fs.has(200)).toBe(true)
  })

  it('should parse content and return null when parser returns empty or throws', async () => {
    ;(service as any).ocrManager = { worker: { id: 'worker-1' } }
    const docTextifySpy = jest.spyOn(docTextifyModule, 'docTextify')
    docTextifySpy.mockResolvedValueOnce('')
    docTextifySpy.mockRejectedValueOnce(new Error('parse failed'))

    const empty = await (service as any).parseContent('/tmp/a.txt', 'txt')
    const failed = await (service as any).parseContent('/tmp/a.txt', 'txt')

    expect(empty).toBeNull()
    expect(failed).toBeNull()
    expect(docTextifySpy).toHaveBeenNthCalledWith(
      1,
      '/tmp/a.txt',
      expect.objectContaining({ newlineDelimiter: ' ', minCharsToExtract: 10, ocrWorker: { id: 'worker-1' } }),
      { extension: 'txt', verified: true }
    )
  })
})
