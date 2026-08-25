import { HttpStatus } from '@nestjs/common'
import type { FileDBProps } from '../interfaces/file-db-props.interface'
import type { FileProps } from '../interfaces/file-props.interface'
import { FilesQueries } from './files-queries.service'

describe(FilesQueries.name, () => {
  const file = { name: 'file.txt', path: 'docs', isDir: false } as FileProps
  const dbFile = { ownerId: 7, inTrash: false, path: 'docs/file.txt' } satisfies FileDBProps
  let service: FilesQueries
  let select: ReturnType<typeof vi.fn>

  beforeEach(() => {
    const limit = vi.fn().mockResolvedValue([])
    const where = vi.fn().mockReturnValue({ limit })
    const from = vi.fn().mockReturnValue({ where })
    select = vi.fn().mockReturnValue({ from })
    service = new FilesQueries({ select } as any)
    vi.spyOn(service['logger'], 'warn').mockImplementation(() => undefined)
    vi.spyOn(service, 'getSpaceFileId').mockResolvedValue(43)
  })

  it('rejects a positive id that differs from the existing file', async () => {
    await expect(service.getOrCreateSpaceFile(42, file, dbFile, { rejectIdMismatch: true })).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      response: 'File id mismatch'
    })
  })

  it('accepts a positive id that matches the existing file', async () => {
    vi.mocked(service.getSpaceFileId).mockResolvedValueOnce(42)

    await expect(service.getOrCreateSpaceFile(42, file, dbFile, { rejectIdMismatch: true })).resolves.toBe(42)
  })

  it.each([0, Number.MAX_SAFE_INTEGER + 1])('rejects the invalid space file id %s', async (fileId) => {
    await expect(service.getOrCreateSpaceFile(fileId, file, dbFile)).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      response: 'Invalid file id'
    })
    expect(select).not.toHaveBeenCalled()
    expect(service.getSpaceFileId).not.toHaveBeenCalled()
  })

  it.each([0, Number.MAX_SAFE_INTEGER + 1])('rejects the invalid user file id %s', async (fileId) => {
    await expect(service.getOrCreateUserFile(7, { ...file, id: fileId })).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      response: 'Invalid file id'
    })
    expect(select).not.toHaveBeenCalled()
  })

  it('keeps the previous reconciliation behavior by default', async () => {
    await expect(service.getOrCreateSpaceFile(42, file, dbFile)).resolves.toBe(43)
  })

  it('accepts a negative inode in strict mode', async () => {
    await expect(service.getOrCreateSpaceFile(-42, file, dbFile, { rejectIdMismatch: true })).resolves.toBe(43)
    expect(select).not.toHaveBeenCalled()
  })
})
