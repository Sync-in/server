import { Test, TestingModule } from '@nestjs/testing'
import { HttpException, HttpStatus } from '@nestjs/common'
import fs from 'fs/promises'
import { SharesQueries } from '../../shares/services/shares-queries.service'
import { SpacesQueries } from '../../spaces/services/spaces-queries.service'
import { FilesContentStore } from '../models/files-content-store'
import { FILE_REPOSITORY } from '../constants/operations'
import { configuration } from '../../../configuration/config.environment'
import { FilesContentParser } from './files-content-parser.service'
import { FilesSearchManager } from './files-search-manager.service'
import { Mock } from 'vitest'

describe(FilesSearchManager.name, () => {
  let service: FilesSearchManager
  let filesIndexer: {
    existingIndexes: Mock
    searchRecords: Mock
  }
  let filesParser: {
    allPaths: Mock
  }
  let spacesQueries: {
    spaceIds: Mock
  }
  let sharesQueries: {
    shareIds: Mock
  }
  let contentIndexingEnabled: boolean

  const fileContent = (name: string) => ({
    id: name.length,
    path: `files/personal/${name}`,
    name,
    mime: 'text-plain',
    size: 1,
    mtime: 1
  })

  beforeEach(async () => {
    filesIndexer = {
      existingIndexes: vi.fn().mockResolvedValue([]),
      searchRecords: vi.fn().mockResolvedValue([])
    }
    filesParser = {
      allPaths: vi.fn()
    }
    spacesQueries = {
      spaceIds: vi.fn().mockResolvedValue([])
    }
    sharesQueries = {
      shareIds: vi.fn().mockResolvedValue([])
    }
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesSearchManager,
        { provide: FilesContentStore, useValue: filesIndexer },
        { provide: FilesContentParser, useValue: filesParser },
        {
          provide: SpacesQueries,
          useValue: spacesQueries
        },
        { provide: SharesQueries, useValue: sharesQueries }
      ]
    }).compile()

    module.useLogger(['fatal'])
    service = module.get<FilesSearchManager>(FilesSearchManager)
    contentIndexingEnabled = configuration.applications.files.contentIndexing.enabled
  })

  afterEach(() => {
    configuration.applications.files.contentIndexing.enabled = contentIndexingEnabled
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  it('should reject full-text search when indexing is disabled', async () => {
    configuration.applications.files.contentIndexing.enabled = false

    await expect(service.search({ id: 9, isAdmin: false } as any, { content: 'report', fullText: true, limit: 10 } as any)).rejects.toEqual(
      new HttpException('Full-text search is disabled', HttpStatus.BAD_REQUEST)
    )
  })

  it('should route to full-text search with space and share ids', async () => {
    configuration.applications.files.contentIndexing.enabled = true
    spacesQueries.spaceIds.mockResolvedValueOnce([1, 2])
    sharesQueries.shareIds.mockResolvedValueOnce([4])
    const fullTextSpy = vi.spyOn(service as any, 'searchFullText').mockResolvedValueOnce([fileContent('match.md')])

    const result = await service.search({ id: 10, isAdmin: true } as any, { content: 'match', fullText: true, limit: 5 } as any)

    expect(spacesQueries.spaceIds).toHaveBeenCalledWith(10)
    expect(sharesQueries.shareIds).toHaveBeenCalledWith(10, 1)
    expect(fullTextSpy).toHaveBeenCalledWith(10, [1, 2], [4], 'match', 5)
    expect(result).toEqual([fileContent('match.md')])
  })

  it('should route to filename search when fullText is false', async () => {
    spacesQueries.spaceIds.mockResolvedValueOnce([6])
    sharesQueries.shareIds.mockResolvedValueOnce([8, 9])
    const nameSearchSpy = vi.spyOn(service as any, 'searchFileNames').mockResolvedValueOnce([fileContent('report.pdf')])

    const result = await service.search({ id: 3, isAdmin: false } as any, { content: 'report', fullText: false, limit: 2 } as any)

    expect(nameSearchSpy).toHaveBeenCalledWith(3, [6], [8, 9], 'report', 2)
    expect(result).toEqual([fileContent('report.pdf')])
  })

  it('should normalize search limit before routing', async () => {
    const nameSearchSpy = vi.spyOn(service as any, 'searchFileNames').mockResolvedValue([])

    await service.search({ id: 3, isAdmin: false } as any, { content: 'report', fullText: false, limit: 1000 } as any)
    await service.search({ id: 3, isAdmin: false } as any, { content: 'report', fullText: false, limit: 0 } as any)
    await service.search({ id: 3, isAdmin: false } as any, { content: 'report', fullText: false } as any)

    expect(nameSearchSpy.mock.calls.map(([, , , , limit]) => limit)).toEqual([100, 1, 100])
  })

  it('should return empty results when no full-text index exists', async () => {
    filesIndexer.existingIndexes.mockResolvedValueOnce([])

    const result = await (service as any).searchFullText(5, [1], [7], 'invoice', 10)

    expect(filesIndexer.existingIndexes).toHaveBeenCalledWith([`user_${5}`, `${FILE_REPOSITORY.SPACE}_1`, `${FILE_REPOSITORY.SHARE}_7`])
    expect(filesIndexer.searchRecords).not.toHaveBeenCalled()
    expect(result).toEqual([])
  })

  it('should map invalid regex full-text errors to a bad request syntax error', async () => {
    filesIndexer.existingIndexes.mockResolvedValueOnce(['user_5'])
    filesIndexer.searchRecords.mockRejectedValueOnce(new Error('Invalid regular expression: /[/'))

    const error = await (service as any).searchFullText(5, [], [], '[', 5).catch((e: HttpException) => e)

    expect(error).toBeInstanceOf(HttpException)
    expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST)
    expect(error.message).toBe('SyntaxError (check special characters)')
  })

  it('should stop filename search when the limit is reached', async () => {
    filesParser.allPaths.mockResolvedValue([
      {
        id: 5,
        type: FILE_REPOSITORY.USER,
        paths: [
          { realPath: '/root/file-a.txt', pathPrefix: 'files/personal', isDir: false },
          { realPath: '/root/dir', pathPrefix: 'files/personal', isDir: true }
        ]
      }
    ])
    vi.spyOn(service as any, 'analyzeFile').mockResolvedValue(fileContent('file-a.txt'))
    vi.spyOn(service as any, 'parseFileNames').mockReturnValue(
      (async function* () {
        yield fileContent('from-dir-1.txt')
        yield fileContent('from-dir-2.txt')
      })()
    )

    const result = await (service as any).searchFileNames(5, [], [], 'file', 2)

    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('file-a.txt')
    expect(result[1].name).toBe('from-dir-1.txt')
  })

  it('should ignore parse errors in parseFileNames', async () => {
    vi.spyOn(fs, 'readdir').mockRejectedValueOnce(new Error('EACCES'))
    const result: any[] = []

    for await (const item of (service as any).parseFileNames('/forbidden', 'files/personal', /^\/?forbidden\/?/, /a/i)) {
      result.push(item)
    }

    expect(result).toEqual([])
  })

  it('should analyze a matching file and return its metadata', async () => {
    vi.spyOn(fs, 'stat').mockResolvedValueOnce({
      ino: 42,
      size: 512,
      mtime: new Date('2024-01-02T03:04:05.000Z'),
      isDirectory: () => false
    } as any)

    const result = await (service as any).analyzeFile('/base/docs/readme.txt', 'files/personal', /^\/?base\/?/, /readme/i)

    expect(result).toEqual({
      id: 42,
      path: 'files/personal/docs',
      name: 'readme.txt',
      mime: 'text-plain',
      size: 512,
      mtime: new Date('2024-01-02T03:04:05.000Z').getTime()
    })
  })

  it('should return null for analyzeFile when terms do not match', async () => {
    const statSpy = vi.spyOn(fs, 'stat')

    const result = await (service as any).analyzeFile('/base/docs/readme.txt', 'files/personal', /^\/?base\/?/, /invoice/i)

    expect(result).toBeNull()
    expect(statSpy).not.toHaveBeenCalled()
  })
})
