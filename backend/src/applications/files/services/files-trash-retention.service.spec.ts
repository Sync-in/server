import { Test, TestingModule } from '@nestjs/testing'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { escapePath } from '../../../common/functions'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants'
import { FILE_REPOSITORY } from '../constants/operations'
import { FileTrash } from '../schemas/file-trash.interface'
import { createTableFilesTrash } from '../schemas/files-trash.schema'
import { FilesTrashRetention } from './files-trash-retention.service'

describe(FilesTrashRetention.name, () => {
  let module: TestingModule
  let service: FilesTrashRetention
  let db: { execute: jest.Mock }

  const asyncGen = <T>(items: T[]) =>
    (async function* () {
      for (const item of items) {
        yield item
      }
    })()

  const sqlText = (query: any): string => {
    if (typeof query === 'string') return query
    if (Array.isArray(query)) return query.map(sqlText).join('')
    if (Array.isArray(query?.value)) return query.value.join('')
    if (Array.isArray(query?.queryChunks)) return query.queryChunks.map(sqlText).join('')
    return ''
  }

  const fileTrash = (id: number, overrides: Partial<FileTrash> = {}): FileTrash => ({
    id,
    path: `file-${id}.txt`,
    isDir: false,
    ...overrides
  })

  const trashContext = (trashPath: string) => ({
    tableName: 'files_trash_user_1',
    regexBasePath: new RegExp(`^/?${escapePath(trashPath)}/?`)
  })

  const collectParsedRecords = async (trashPath: string): Promise<FileTrash[]> => {
    const records: FileTrash[] = []
    for await (const record of (service as any).parseFiles(trashPath, trashContext(trashPath))) {
      records.push(record)
    }
    return records
  }

  const mockTrashPath = (files: FileTrash[] = []) => {
    jest.spyOn(service as any, 'allPaths').mockResolvedValueOnce([{ id: 9, type: FILE_REPOSITORY.USER, realPath: '/trash' }])
    jest.spyOn(service as any, 'createTable').mockResolvedValueOnce(true)
    jest.spyOn(service as any, 'parseFiles').mockReturnValueOnce(asyncGen(files))
  }

  beforeEach(async () => {
    db = { execute: jest.fn() }

    module = await Test.createTestingModule({
      providers: [FilesTrashRetention, { provide: DB_TOKEN_PROVIDER, useValue: db }]
    }).compile()

    module.useLogger(['fatal'])
    service = module.get<FilesTrashRetention>(FilesTrashRetention)
  })

  afterEach(async () => {
    jest.restoreAllMocks()
    jest.clearAllMocks()
    await module.close()
  })

  it('should create trash tables with a seen run id column', () => {
    const schema = createTableFilesTrash('files_trash_user_1')

    expect(schema).toContain('deletedAt date')
    expect(schema).toContain('INDEX is_dir_deleted_at (isDir, deletedAt)')
    expect(schema).toContain('seen_run_id varchar(64)')
    expect(schema).toContain('INDEX seen_run_id (seen_run_id)')
  })

  it('should process trash files by batches of 1000 and delete unseen records', async () => {
    ;(service as any).retentionDays = 30
    const files = Array.from({ length: 1001 }, (_, i) => fileTrash(i + 1))
    mockTrashPath(files)
    const indexTrashBatchSpy = jest.spyOn(service as any, 'indexTrashBatch').mockResolvedValue({ indexedRecords: 0, errorRecords: 0 })
    const deleteUnseenRecordsSpy = jest.spyOn(service as any, 'deleteUnseenRecords').mockResolvedValueOnce(2)
    const cleanupExpiredRecordsSpy = jest.spyOn(service as any, 'cleanupExpiredRecords').mockResolvedValueOnce({ deletedRecords: 3, errorRecords: 0 })

    await service.indexAndCleanTrash()

    expect(indexTrashBatchSpy).toHaveBeenCalledTimes(2)
    expect(indexTrashBatchSpy.mock.calls[0][2]).toHaveLength(1000)
    expect(indexTrashBatchSpy.mock.calls[1][2]).toHaveLength(1)
    expect(deleteUnseenRecordsSpy).toHaveBeenCalledWith('files_trash_user_9', expect.any(String))
    expect(cleanupExpiredRecordsSpy).toHaveBeenCalledWith('files_trash_user_9', '/trash')
  })

  it('should skip expired cleanup when unseen records cannot be deleted', async () => {
    ;(service as any).retentionDays = 30
    mockTrashPath([fileTrash(1)])
    jest.spyOn(service as any, 'indexTrashBatch').mockResolvedValueOnce({ indexedRecords: 1, errorRecords: 0 })
    jest.spyOn(service as any, 'deleteUnseenRecords').mockResolvedValueOnce(null)
    const cleanupExpiredRecordsSpy = jest.spyOn(service as any, 'cleanupExpiredRecords')

    await service.indexAndCleanTrash()

    expect(cleanupExpiredRecordsSpy).not.toHaveBeenCalled()
  })

  it('should parse directories, files and directory symlinks from trash paths', async () => {
    const trashPath = await fs.mkdtemp(path.join(os.tmpdir(), 'trash-retention-'))
    try {
      await fs.mkdir(path.join(trashPath, 'empty-dir'))
      await fs.mkdir(path.join(trashPath, 'nested-dir'))
      await fs.writeFile(path.join(trashPath, 'nested-dir', 'file.txt'), 'content')
      await fs.symlink(path.join(trashPath, 'nested-dir'), path.join(trashPath, 'directory-link'))
      const records = await collectParsedRecords(trashPath)

      expect(records).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: 'empty-dir', isDir: true }),
          expect.objectContaining({ path: 'nested-dir', isDir: true }),
          expect.objectContaining({ path: 'nested-dir/file.txt', isDir: false }),
          expect.objectContaining({ path: 'directory-link', isDir: false })
        ])
      )
    } finally {
      await fs.rm(trashPath, { recursive: true, force: true })
    }
  })

  it('should insert changed records and mark unchanged records seen inside a batch', async () => {
    const runId = 'run-1'
    jest.spyOn(service as any, 'getRecordMetadataByIds').mockResolvedValueOnce(
      new Map([
        [1, { path: 'file-1.txt', isDir: false }],
        [2, { path: 'old.txt', isDir: false }]
      ])
    )
    const insertRecordSpy = jest
      .spyOn(service as any, 'insertRecord')
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    const markRecordsSeenSpy = jest.spyOn(service as any, 'markRecordsSeen').mockResolvedValueOnce(true)

    await expect(
      (service as any).indexTrashBatch('files_trash_user_1', runId, [fileTrash(1), fileTrash(2, { path: 'file-2.txt' }), fileTrash(3)])
    ).resolves.toEqual({ indexedRecords: 2, errorRecords: 1 })

    expect(insertRecordSpy).toHaveBeenCalledTimes(2)
    expect(insertRecordSpy).toHaveBeenCalledWith('files_trash_user_1', expect.objectContaining({ id: 2 }), runId)
    expect(insertRecordSpy).toHaveBeenCalledWith('files_trash_user_1', expect.objectContaining({ id: 3 }), runId)
    expect(markRecordsSeenSpy).toHaveBeenCalledWith('files_trash_user_1', [1], runId)
  })

  it('should reset deletedAt when an existing record metadata changes', async () => {
    db.execute.mockResolvedValueOnce([{ affectedRows: 1 }])

    await expect((service as any).insertRecord('files_trash_user_1', fileTrash(2, { path: 'file-2.txt' }), 'run-1')).resolves.toBe(true)

    const query = sqlText(db.execute.mock.calls[0][0])
    expect(query).toContain('ON DUPLICATE KEY UPDATE')
    expect(query).toContain('deletedAt = CURRENT_DATE')
  })

  it('should delete expired records from filesystem and database', async () => {
    ;(service as any).retentionDays = 30
    const expiredRecords = [fileTrash(1), fileTrash(2, { path: 'nested' })]
    const getExpiredRecordsSpy = jest
      .spyOn(service as any, 'getExpiredRecords')
      .mockResolvedValueOnce(expiredRecords)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    jest
      .spyOn(service as any, 'deleteTrashRecordFile')
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
    const deleteRecordsByIdsSpy = jest.spyOn(service as any, 'deleteRecordsByIds').mockResolvedValueOnce(1)

    await expect((service as any).cleanupExpiredRecords('files_trash_user_1', '/trash')).resolves.toEqual({
      deletedRecords: 1,
      errorRecords: 1
    })

    expect(getExpiredRecordsSpy).toHaveBeenCalledTimes(3)
    expect(getExpiredRecordsSpy).toHaveBeenNthCalledWith(1, 'files_trash_user_1', false, [])
    expect(getExpiredRecordsSpy).toHaveBeenNthCalledWith(2, 'files_trash_user_1', false, [2])
    expect(getExpiredRecordsSpy).toHaveBeenNthCalledWith(3, 'files_trash_user_1', true, [])
    expect(deleteRecordsByIdsSpy).toHaveBeenCalledWith('files_trash_user_1', [1])
  })

  it('should only query expired directories without indexed descendants', async () => {
    ;(service as any).retentionDays = 30
    db.execute.mockResolvedValueOnce([[]])

    await expect((service as any).getExpiredRecords('files_trash_user_1', true)).resolves.toEqual([])

    const query = sqlText(db.execute.mock.calls[0][0])
    expect(query).toContain('NOT EXISTS')
    expect(query).toContain('FROM files_trash_user_1 AS child')
    expect(query).toContain('child.path LIKE CONCAT')
    expect(query).toContain("ESCAPE '='")
    expect(query).toContain('ORDER BY trash_record.deletedAt, trash_record.id')
  })

  it('should resolve trash record paths inside the trash root only', () => {
    expect((service as any).resolveTrashRecordPath('/trash', fileTrash(1, { path: 'root.txt' }))).toBe('/trash/root.txt')
    expect((service as any).resolveTrashRecordPath('/trash', fileTrash(1, { path: 'nested/old.txt' }))).toBe('/trash/nested/old.txt')
    expect(() => (service as any).resolveTrashRecordPath('/trash', fileTrash(2, { path: '../outside.txt' }))).toThrow('outside trash path')
  })
})
