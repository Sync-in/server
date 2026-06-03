import { Test, TestingModule } from '@nestjs/testing'
import fs from 'fs/promises'
import path from 'node:path'
import { Cache } from '../../../infrastructure/cache/cache.service'
import {
  CACHE_INDEXING_EVENT_PREFIX,
  CACHE_INDEXING_FULL_RUN_REQUEST_KEY,
  CACHE_INDEXING_FULL_RUN_REQUEST_TTL,
  CACHE_INDEXING_LAST_RUN_KEY,
  CACHE_INDEXING_RUNNING_KEY,
  CACHE_INDEXING_RUNNING_TTL
} from '../constants/indexing'
import { FILE_REPOSITORY } from '../constants/operations'
import { FileContentIndexContext, FileParseContentPath, FileParseContext } from '../interfaces/file-parse-index'
import { IndexingState } from '../interfaces/indexing.interface'
import { FilesContentStore } from '../models/files-content-store'
import * as docTextifyModule from '../utils/doc-textify/doc-textify'
import { OCRManager } from '../utils/doc-textify/utils/ocr'
import { FilesContentParser } from './files-content-parser.service'
import { FilesContentIndexer } from './files-content-indexer.service'
import type { Mock } from 'vitest'

interface CacheMock {
  has: Mock
  keys: Mock
  get: Mock
  set: Mock
  del: Mock
}

interface FilesContentStoreMock {
  indexesCount: Mock
  getIndexName: Mock
  createIndex: Mock
  getRecordMetadataByIds: Mock
  markRecordsSeen: Mock
  insertRecord: Mock
  deleteRecords: Mock
  deleteUnseenRecords: Mock
  dropIndex: Mock
  cleanIndexes: Mock
  dropAllIndexes: Mock
}

interface FilesContentParserMock {
  allPaths: Mock
}

interface FileMetadataMock {
  id: number
  path: string
  name: string
  mime: string
  size: number
  mtime: number
  realPath: string
  extension: string
}

describe(FilesContentIndexer.name, () => {
  let service: FilesContentIndexer
  let cache: CacheMock
  let filesIndexer: FilesContentStoreMock
  let filesParser: FilesContentParserMock

  const asyncGen = <T>(items: T[]) =>
    (async function* () {
      for (const item of items) {
        yield item
      }
    })()

  const parsePath = (overrides: Partial<FileParseContext> = {}): FileParseContext => ({
    realPath: '/root',
    pathPrefix: 'files/personal',
    isDir: true,
    ...overrides
  })

  const parseContentPath = (overrides: Partial<FileParseContentPath> = {}): FileParseContentPath => ({
    id: 1,
    type: FILE_REPOSITORY.USER,
    paths: [parsePath({ realPath: '/u/john' })],
    ...overrides
  })

  const contentContext = (overrides: Partial<FileContentIndexContext> = {}): FileContentIndexContext => ({
    indexName: 'user_1',
    pathPrefix: 'files/personal',
    regexBasePath: /^\/?data\/base\/?/,
    ...overrides
  })

  const fileMetadata = (overrides: Partial<FileMetadataMock> = {}): FileMetadataMock => ({
    id: 3,
    path: 'files/personal',
    name: 'new.txt',
    mime: 'text-plain',
    size: 30,
    mtime: 1700000000000,
    realPath: '/root/new.txt',
    extension: 'txt',
    ...overrides
  })

  const ocrManager = (overrides: Partial<{ worker: any; start: Mock; stop: Mock }> = {}) => ({
    worker: null,
    start: vi.fn().mockResolvedValue(null),
    stop: vi.fn().mockResolvedValue(undefined),
    ...overrides
  })

  const indexFiles = (indexSuffix = 'user_1', paths: FileParseContext[] = [parsePath()]) =>
    (service as any).indexFiles(indexSuffix, paths) as Promise<void>

  beforeEach(async () => {
    cache = {
      has: vi.fn().mockResolvedValue(false),
      keys: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(true),
      del: vi.fn().mockResolvedValue(true)
    }
    filesIndexer = {
      indexesCount: vi.fn().mockResolvedValue(0),
      getIndexName: vi.fn((suffix: string) => `files_content_${suffix}`),
      createIndex: vi.fn().mockResolvedValue(true),
      getRecordMetadataByIds: vi.fn().mockResolvedValue(new Map()),
      markRecordsSeen: vi.fn().mockResolvedValue(true),
      insertRecord: vi.fn().mockResolvedValue(true),
      deleteRecords: vi.fn().mockResolvedValue(undefined),
      deleteUnseenRecords: vi.fn().mockResolvedValue(0),
      dropIndex: vi.fn().mockResolvedValue(true),
      cleanIndexes: vi.fn().mockResolvedValue(undefined),
      dropAllIndexes: vi.fn().mockResolvedValue(undefined)
    }
    filesParser = {
      allPaths: vi.fn().mockResolvedValue([])
    }
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesContentIndexer,
        { provide: Cache, useValue: cache },
        { provide: FilesContentStore, useValue: filesIndexer },
        { provide: FilesContentParser, useValue: filesParser }
      ]
    }).compile()

    module.useLogger(['fatal'])
    service = module.get<FilesContentIndexer>(FilesContentIndexer)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  it('should report running state from cache', async () => {
    cache.has.mockResolvedValueOnce(true)
    await expect(service.isRunning()).resolves.toBe(true)
    expect(cache.has).toHaveBeenCalledWith(CACHE_INDEXING_RUNNING_KEY)
  })

  it('should reset indexing runtime state in cache', async () => {
    await service.resetIndexingRuntimeState()
    expect(cache.del).toHaveBeenCalledWith(CACHE_INDEXING_RUNNING_KEY)
    expect(cache.del).toHaveBeenCalledWith(CACHE_INDEXING_FULL_RUN_REQUEST_KEY)
  })

  it('should request full indexing only when no run is active', async () => {
    cache.has.mockResolvedValueOnce(false)
    const parseSpy = vi.spyOn(service as any, 'parseAndIndexAllFiles').mockResolvedValueOnce(undefined)

    await expect(service.startIndexing()).resolves.toBe(true)
    expect(parseSpy).not.toHaveBeenCalled()
    expect(cache.set).toHaveBeenCalledWith(CACHE_INDEXING_FULL_RUN_REQUEST_KEY, expect.any(Number), CACHE_INDEXING_FULL_RUN_REQUEST_TTL)
  })

  it('should not start indexing when a run is already active', async () => {
    cache.has.mockResolvedValueOnce(true)
    const parseSpy = vi.spyOn(service as any, 'parseAndIndexAllFiles').mockResolvedValueOnce(undefined)

    await expect(service.startIndexing()).resolves.toBe(false)
    expect(parseSpy).not.toHaveBeenCalled()
    expect(cache.set).not.toHaveBeenCalledWith(CACHE_INDEXING_FULL_RUN_REQUEST_KEY, expect.any(Number), CACHE_INDEXING_FULL_RUN_REQUEST_TTL)
  })

  it('should request full indexing without checking active runs', async () => {
    await expect(service.requestFullIndexing()).resolves.toBe(true)
    expect(cache.has).not.toHaveBeenCalled()
    expect(cache.set).toHaveBeenCalledWith(CACHE_INDEXING_FULL_RUN_REQUEST_KEY, expect.any(Number), CACHE_INDEXING_FULL_RUN_REQUEST_TTL)
  })

  it('should stop indexing by setting STOPPING state', async () => {
    cache.has.mockResolvedValueOnce(true)

    await expect(service.stopIndexing()).resolves.toBe(true)
    expect(cache.del).toHaveBeenCalledWith(CACHE_INDEXING_FULL_RUN_REQUEST_KEY)
    expect(cache.set).toHaveBeenCalledWith(CACHE_INDEXING_RUNNING_KEY, IndexingState.STOPPING, CACHE_INDEXING_RUNNING_TTL)
  })

  it('should not stop indexing when no run is active', async () => {
    cache.has.mockResolvedValueOnce(false)

    await expect(service.stopIndexing()).resolves.toBe(false)
    expect(cache.set).not.toHaveBeenCalledWith(CACHE_INDEXING_RUNNING_KEY, IndexingState.STOPPING, CACHE_INDEXING_RUNNING_TTL)
    expect(cache.del).not.toHaveBeenCalledWith(CACHE_INDEXING_FULL_RUN_REQUEST_KEY)
  })

  it('should cancel a pending full indexing request when no run is active', async () => {
    cache.has.mockResolvedValueOnce(false).mockResolvedValueOnce(true)

    await expect(service.stopIndexing()).resolves.toBe(true)
    expect(cache.del).toHaveBeenCalledWith(CACHE_INDEXING_FULL_RUN_REQUEST_KEY)
    expect(cache.set).not.toHaveBeenCalledWith(CACHE_INDEXING_RUNNING_KEY, IndexingState.STOPPING, CACHE_INDEXING_RUNNING_TTL)
  })

  it('should return indexing status with index count and full/partial runs', async () => {
    cache.get.mockResolvedValueOnce(IndexingState.RUNNING).mockResolvedValueOnce(1700000000000).mockResolvedValueOnce(1700000500000)
    filesIndexer.indexesCount.mockResolvedValueOnce(7)

    await expect(service.status()).resolves.toEqual({
      indexesCount: 7,
      state: IndexingState.RUNNING,
      lastFullRunAt: 1700000000000,
      lastPartialRunAt: 1700000500000
    })
  })

  it('should return pending indexing status when a full run is pending', async () => {
    cache.get.mockResolvedValueOnce(null).mockResolvedValueOnce(1700000000000).mockResolvedValueOnce(1700000500000)
    cache.has.mockResolvedValueOnce(true)

    await expect(service.status()).resolves.toEqual({
      indexesCount: 0,
      state: IndexingState.PENDING,
      lastFullRunAt: 1700000000000,
      lastPartialRunAt: 1700000500000
    })
  })

  it('should keep default index count when count retrieval fails', async () => {
    cache.get.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(null)
    filesIndexer.indexesCount.mockRejectedValueOnce(new Error('db offline'))

    await expect(service.status()).resolves.toEqual({
      indexesCount: 0,
      state: IndexingState.IDLE,
      lastFullRunAt: null,
      lastPartialRunAt: null
    })
  })

  it('should drop all indexes', async () => {
    await service.dropIndexes()
    expect(filesIndexer.dropAllIndexes).toHaveBeenCalledTimes(1)
  })

  it('should aggregate indexing event keys, parse matching entries and clean cache keys', async () => {
    cache.keys.mockResolvedValueOnce([
      `${CACHE_INDEXING_EVENT_PREFIX}-user-1`,
      `${CACHE_INDEXING_EVENT_PREFIX}-space-2`,
      `${CACHE_INDEXING_EVENT_PREFIX}-share-3`,
      `${CACHE_INDEXING_EVENT_PREFIX}-unknown-9`
    ])
    const parseSpy = vi.spyOn(service as any, 'parseAndIndexAllFiles').mockResolvedValueOnce(undefined)

    await service.processIndexingQueue()

    expect(parseSpy).toHaveBeenCalledWith([1], [2], [3])
    expect(cache.del).toHaveBeenCalledWith(`${CACHE_INDEXING_EVENT_PREFIX}-user-1`)
    expect(cache.del).toHaveBeenCalledWith(`${CACHE_INDEXING_EVENT_PREFIX}-space-2`)
    expect(cache.del).toHaveBeenCalledWith(`${CACHE_INDEXING_EVENT_PREFIX}-share-3`)
    expect(cache.del).toHaveBeenCalledWith(`${CACHE_INDEXING_EVENT_PREFIX}-unknown-9`)
  })

  it('should consume pending full indexing request before partial indexing events', async () => {
    cache.has.mockResolvedValueOnce(true)
    cache.keys.mockResolvedValueOnce([`${CACHE_INDEXING_EVENT_PREFIX}-user-1`])
    const parseSpy = vi.spyOn(service as any, 'parseAndIndexAllFiles').mockResolvedValueOnce(undefined)

    await service.processIndexingQueue()

    expect(cache.del).toHaveBeenCalledWith(CACHE_INDEXING_FULL_RUN_REQUEST_KEY)
    expect(parseSpy).toHaveBeenCalledWith()
    expect(cache.keys).not.toHaveBeenCalled()
    expect(cache.del).not.toHaveBeenCalledWith(`${CACHE_INDEXING_EVENT_PREFIX}-user-1`)
  })

  it('should only clean keys when no valid indexing repository type is found', async () => {
    cache.keys.mockResolvedValueOnce([`${CACHE_INDEXING_EVENT_PREFIX}-unknown-10`])
    const parseSpy = vi.spyOn(service as any, 'parseAndIndexAllFiles').mockResolvedValueOnce(undefined)

    await service.processIndexingQueue()

    expect(parseSpy).not.toHaveBeenCalled()
    expect(cache.del).toHaveBeenCalledWith(`${CACHE_INDEXING_EVENT_PREFIX}-unknown-10`)
  })

  it('should start and stop OCR manager, index all parser paths and clean stale indexes on full reindex', async () => {
    const manager = ocrManager()
    vi.spyOn(OCRManager, 'getInstance').mockReturnValue(manager as any)
    filesParser.allPaths.mockResolvedValue([
      parseContentPath(),
      parseContentPath({ id: 5, type: FILE_REPOSITORY.SPACE, paths: [parsePath({ realPath: '/s/project', pathPrefix: 'files/project' })] })
    ] as FileParseContentPath[])
    const indexSpy = vi.spyOn(service as any, 'indexFiles').mockResolvedValue(undefined)

    await (service as any).parseAndIndexAllFiles()

    expect(manager.start).toHaveBeenCalledTimes(1)
    expect(indexSpy).toHaveBeenNthCalledWith(1, 'user_1', [{ realPath: '/u/john', pathPrefix: 'files/personal', isDir: true }])
    expect(indexSpy).toHaveBeenNthCalledWith(2, 'space_5', [{ realPath: '/s/project', pathPrefix: 'files/project', isDir: true }])
    expect(filesIndexer.cleanIndexes).toHaveBeenCalledWith(['user_1', 'space_5'])
    expect(cache.set).toHaveBeenCalledWith(CACHE_INDEXING_LAST_RUN_KEY, expect.any(Number), 0)
    expect(manager.stop).toHaveBeenCalledTimes(1)
  })

  it('should stop parsing early when STOPPING state is detected', async () => {
    const manager = ocrManager()
    vi.spyOn(OCRManager, 'getInstance').mockReturnValue(manager as any)
    filesParser.allPaths.mockResolvedValue([parseContentPath()] as FileParseContentPath[])
    cache.get
      .mockResolvedValueOnce(IndexingState.STOPPING) // setRunning(true) guard
      .mockResolvedValueOnce(IndexingState.STOPPING) // loop STOPPING check
    const indexSpy = vi.spyOn(service as any, 'indexFiles').mockResolvedValue(undefined)

    await (service as any).parseAndIndexAllFiles()

    expect(indexSpy).not.toHaveBeenCalled()
    expect(filesIndexer.cleanIndexes).not.toHaveBeenCalled()
    expect(manager.stop).toHaveBeenCalledTimes(1)
  })

  it('should continue parseAndIndexAllFiles when OCR startup fails and skip cleanIndexes for incremental runs', async () => {
    const manager = ocrManager({ start: vi.fn().mockRejectedValue(new Error('ocr init failed')) })
    vi.spyOn(OCRManager, 'getInstance').mockReturnValue(manager as any)
    filesParser.allPaths.mockResolvedValue([parseContentPath({ id: 9, paths: [parsePath({ realPath: '/u/jane' })] })] as FileParseContentPath[])
    vi.spyOn(service as any, 'indexFiles').mockResolvedValue(undefined)

    await (service as any).parseAndIndexAllFiles([9], [], [])

    expect(filesIndexer.cleanIndexes).not.toHaveBeenCalled()
    expect(manager.stop).toHaveBeenCalledTimes(1)
  })

  it('should skip indexFiles when index creation fails', async () => {
    filesIndexer.createIndex.mockResolvedValueOnce(false)

    await indexFiles('user_7', [parsePath({ realPath: '/u/john' })])

    expect(filesIndexer.getRecordMetadataByIds).not.toHaveBeenCalled()
    expect(filesIndexer.insertRecord).not.toHaveBeenCalled()
    expect(filesIndexer.deleteRecords).not.toHaveBeenCalled()
    expect(filesIndexer.deleteUnseenRecords).not.toHaveBeenCalled()
    expect(filesIndexer.dropIndex).not.toHaveBeenCalled()
  })

  it('should drop empty index when there is no db data and no indexed records', async () => {
    vi.spyOn(service as any, 'parseFileMetadata').mockReturnValue(asyncGen([]))

    await indexFiles('user_8', [parsePath({ realPath: '/empty' })])

    expect(filesIndexer.dropIndex).toHaveBeenCalledWith('files_content_user_8')
  })

  it('should insert parsed records, mark unchanged records and delete unseen entries in indexFiles', async () => {
    filesIndexer.getRecordMetadataByIds.mockResolvedValueOnce(new Map([[2, { path: 'files/personal', name: 'keep.txt', size: 20 }]]))
    filesIndexer.deleteUnseenRecords.mockResolvedValueOnce(1)
    vi.spyOn(service as any, 'parseFileMetadata').mockImplementation(async function* () {
      yield fileMetadata({
        id: 2,
        name: 'keep.txt',
        size: 20,
        realPath: '/root/keep.txt'
      })
      yield fileMetadata()
    })
    vi.spyOn(service as any, 'parseContent').mockResolvedValueOnce('indexed')

    await indexFiles('user_9')

    expect(filesIndexer.insertRecord).toHaveBeenCalledWith(
      'files_content_user_9',
      expect.objectContaining({ id: 3, name: 'new.txt', content: 'indexed' }),
      expect.any(String)
    )
    expect(filesIndexer.markRecordsSeen).toHaveBeenCalledWith('files_content_user_9', [2], expect.any(String))
    expect(filesIndexer.deleteUnseenRecords).toHaveBeenCalledWith('files_content_user_9', expect.any(String))
  })

  it('should not delete unseen records when marking seen records fails', async () => {
    filesIndexer.getRecordMetadataByIds.mockResolvedValueOnce(new Map([[2, { path: 'files/personal', name: 'keep.txt', size: 20 }]]))
    filesIndexer.markRecordsSeen.mockResolvedValueOnce(false)
    vi.spyOn(service as any, 'parseFileMetadata').mockReturnValue(
      asyncGen([
        fileMetadata({
          id: 2,
          name: 'keep.txt',
          size: 20,
          realPath: '/root/keep.txt'
        })
      ])
    )

    await expect(indexFiles('user_10')).rejects.toThrow('unable to mark records as seen')
    expect(filesIndexer.deleteUnseenRecords).not.toHaveBeenCalled()
  })

  it('should not mark new records as seen when insert fails', async () => {
    filesIndexer.getRecordMetadataByIds.mockResolvedValueOnce(new Map())
    filesIndexer.insertRecord.mockResolvedValueOnce(false)
    filesIndexer.deleteUnseenRecords.mockResolvedValueOnce(1)
    vi.spyOn(service as any, 'parseFileMetadata').mockReturnValue(asyncGen([fileMetadata()]))
    vi.spyOn(service as any, 'parseContent').mockResolvedValueOnce('indexed')

    await indexFiles('user_11')

    expect(filesIndexer.insertRecord).toHaveBeenCalledWith(
      'files_content_user_11',
      expect.objectContaining({ id: 3, name: 'new.txt', content: 'indexed' }),
      expect.any(String)
    )
    expect(filesIndexer.markRecordsSeen).toHaveBeenCalledWith('files_content_user_11', [], expect.any(String))
    expect(filesIndexer.deleteUnseenRecords).toHaveBeenCalledWith('files_content_user_11', expect.any(String))
  })

  it('should keep existing records seen when insert fails', async () => {
    filesIndexer.getRecordMetadataByIds.mockResolvedValueOnce(new Map([[3, { path: 'files/personal', name: 'old.txt', size: 1 }]]))
    filesIndexer.insertRecord.mockResolvedValueOnce(false)
    filesIndexer.deleteUnseenRecords.mockResolvedValueOnce(1)
    vi.spyOn(service as any, 'parseFileMetadata').mockReturnValue(asyncGen([fileMetadata()]))
    vi.spyOn(service as any, 'parseContent').mockResolvedValueOnce('indexed')

    await indexFiles('user_12')

    expect(filesIndexer.insertRecord).toHaveBeenCalledWith(
      'files_content_user_12',
      expect.objectContaining({ id: 3, name: 'new.txt', content: 'indexed' }),
      expect.any(String)
    )
    expect(filesIndexer.markRecordsSeen).toHaveBeenCalledWith('files_content_user_12', [3], expect.any(String))
    expect(filesIndexer.deleteUnseenRecords).toHaveBeenCalledWith('files_content_user_12', expect.any(String))
  })

  it('should recursively parse directories and yield file metadata only', async () => {
    const readdirSpy = vi.spyOn(fs, 'readdir')
    readdirSpy.mockResolvedValueOnce([
      { parentPath: '/root', name: 'sub', isDirectory: () => true },
      { parentPath: '/root', name: 'a.txt', isDirectory: () => false }
    ] as any)
    readdirSpy.mockResolvedValueOnce([{ parentPath: '/root/sub', name: 'b.txt', isDirectory: () => false }] as any)
    vi.spyOn(service as any, 'getFileMetadata').mockImplementation(async (realPath: string) =>
      fileMetadata({
        id: realPath.length,
        name: path.basename(realPath),
        realPath
      })
    )
    const yielded: any[] = []

    for await (const metadata of (service as any).parseFileMetadata('/root', contentContext({ regexBasePath: /^\/?root\/?/ }))) {
      yielded.push(metadata)
    }

    expect(yielded.map((f) => f.name)).toEqual(['b.txt', 'a.txt'])
  })

  it('should skip non-indexable files in getFileMetadata', async () => {
    const statSpy = vi.spyOn(fs, 'stat')
    const context = contentContext({ regexBasePath: /^\/?data\/?/ })

    const unsupported = await (service as any).getFileMetadata('/data/image.png', context, false)
    expect(unsupported).toBeNull()
    expect(statSpy).not.toHaveBeenCalled()
  })

  it('should build file metadata in getFileMetadata for indexable files', async () => {
    const context = contentContext()
    vi.spyOn(fs, 'stat').mockResolvedValueOnce({
      ino: 200,
      size: 42,
      mtime: new Date('2024-01-02T03:04:05.000Z')
    } as any)

    const fileMetadata = await (service as any).getFileMetadata('/data/base/sub/doc.txt', context, false)

    expect(fileMetadata).toEqual({
      id: 200,
      path: 'files/personal/sub',
      name: 'doc.txt',
      mime: 'text-plain',
      size: 42,
      mtime: new Date('2024-01-02T03:04:05.000Z').getTime(),
      realPath: '/data/base/sub/doc.txt',
      extension: 'txt'
    })
  })

  it('should build indexed file content from file metadata', async () => {
    const context = contentContext()
    vi.spyOn(fs, 'stat').mockResolvedValueOnce({
      ino: 200,
      size: 42,
      mtime: new Date('2024-01-02T03:04:05.000Z')
    } as any)
    vi.spyOn(service as any, 'parseContent').mockResolvedValueOnce('indexed content')

    const fileMetadata = await (service as any).getFileMetadata('/data/base/sub/doc.txt', context, false)
    const fileContent = await (service as any).buildFileContent(fileMetadata)

    expect(fileContent).toEqual({
      id: 200,
      path: 'files/personal/sub',
      name: 'doc.txt',
      mime: 'text-plain',
      size: 42,
      mtime: new Date('2024-01-02T03:04:05.000Z').getTime(),
      content: 'indexed content'
    })
  })

  it('should parse content and return null when parser returns empty or throws', async () => {
    ;(service as any).ocrManager = { worker: { id: 'worker-1' } }
    const docTextifySpy = vi.spyOn(docTextifyModule, 'docTextify')
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
