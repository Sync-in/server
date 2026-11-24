import { HttpStatus } from '@nestjs/common'
import fs, { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { FileError } from '../models/file-error.js'
import { storageQuotaExceededError } from './errors.js'
import {
  createSizeLimiter,
  getMimeType,
  isCrossDevice,
  isInternalTemporaryEntry,
  isInternalTemporaryPath,
  isPathInside,
  moveFiles,
  sanitizeName,
  serverTemporaryEntryPrefix,
  serverTemporaryEntryUserId,
  temporaryFileName,
  temporaryFilePath,
  temporaryFilePrefix,
  tryReflink,
  uniqueDatedFilePath,
  writeFromStream,
  writeFromStreamAndChecksum,
  writeUploadFromStream,
  writeUploadFromStreamAndChecksum
} from './files.js'
import { FILE_ERROR } from '../constants/errors.js'
import { UploadStreamLimiter } from './upload-file.js'

describe(createSizeLimiter.name, () => {
  it('rejects the call that makes the cumulative size exceed the limit', () => {
    const checkSize = createSizeLimiter(5, storageQuotaExceededError)

    expect(() => checkSize(3)).not.toThrow()
    expect(() => checkSize(2)).not.toThrow()
    let sizeError: unknown
    try {
      checkSize(1)
    } catch (error) {
      sizeError = error
    }
    expect(sizeError).toMatchObject({
      httpCode: HttpStatus.INSUFFICIENT_STORAGE,
      message: FILE_ERROR.STORAGE_QUOTA_EXCEEDED,
      name: FileError.name
    })
  })
})

describe(isPathInside.name, () => {
  const basePath = path.join(path.sep, 'tmp', 'output')

  it('accepts only paths inside the base path', () => {
    expect(isPathInside(basePath, path.join(basePath, 'safe', 'file.txt'))).toBe(true)
    expect(isPathInside(basePath, basePath)).toBe(false)
    expect(isPathInside(basePath, basePath, true)).toBe(true)
    expect(isPathInside(path.parse(basePath).root, path.parse(basePath).root)).toBe(false)
    expect(isPathInside(basePath, path.join(basePath, '..', 'zip-slip-proof.txt'))).toBe(false)
    expect(isPathInside(basePath, path.join(path.sep, 'tmp', 'output-evil', 'file.txt'))).toBe(false)
  })
})

describe(isInternalTemporaryPath.name, () => {
  it('checks path segments relative to the exposed repository root', () => {
    const basePath = path.join(path.sep, 'data', 'users', '.sync-in.user')

    expect(isInternalTemporaryPath(basePath, path.join(basePath, 'documents', '.sync-in-tmp', 'server-user-42-upload-task-file'))).toBe(true)
    expect(isInternalTemporaryPath(basePath, path.join(basePath, 'documents', '.SYNC-IN-TMP', 'server-user-42-upload-task-file'))).toBe(true)
    expect(isInternalTemporaryPath(basePath, path.join(basePath, 'documents', '.sync-in.uploading'))).toBe(false)
    expect(isInternalTemporaryPath(basePath, path.join(basePath, 'documents'))).toBe(false)
  })
})

describe(isInternalTemporaryEntry.name, () => {
  it('reserves every casing of the storage namespace only', () => {
    expect(isInternalTemporaryEntry('.sync-in-tmp')).toBe(true)
    expect(isInternalTemporaryEntry('.SYNC-IN-TMP')).toBe(true)
    expect(isInternalTemporaryEntry('.sync-in.uploading')).toBe(false)
    expect(isInternalTemporaryEntry('.sync-in-tmp-user')).toBe(false)
  })
})

describe(sanitizeName.name, () => {
  it('removes separators before stripping trailing path segments', () => {
    expect(sanitizeName('./')).toBe('')
    expect(sanitizeName('.\\')).toBe('')
    expect(sanitizeName('folder./')).toBe('folder')
    expect(sanitizeName('archive.tar.gz')).toBe('archive.tar.gz')
  })
})

describe(getMimeType.name, () => {
  it('returns draw.io MIME types for diagrams and workbooks', () => {
    expect(getMimeType('/path/to/diagram.drawio', false)).toBe('application-x-drawio')
    expect(getMimeType('/path/to/diagram.dwb', false)).toBe('application-x-drawio-wb')
  })
})

describe(isCrossDevice.name, () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('compares the source device with the nearest existing destination parent', async () => {
    vi.spyOn(fs, 'lstat').mockResolvedValueOnce({ dev: 1 } as any)
    const statSpy = vi.spyOn(fs, 'stat').mockResolvedValueOnce({ dev: 2 } as any)
    vi.spyOn(fs, 'access').mockRejectedValueOnce(new Error()).mockRejectedValueOnce(new Error()).mockResolvedValueOnce(undefined)
    const dstPath = path.join(path.sep, 'missing', 'parent', 'destination.txt')

    await expect(isCrossDevice('/source.txt', dstPath)).resolves.toBe(true)

    expect(statSpy).toHaveBeenCalledWith(path.parse(dstPath).root)
  })
})

describe(moveFiles.name, () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'move-files-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('publishes a file without keeping the staged source', async () => {
    const source = path.join(tmpDir, 'source.txt')
    const destination = path.join(tmpDir, 'destination.txt')
    await writeFile(source, 'complete')

    await moveFiles(source, destination, false)

    await expect(readFile(destination, 'utf8')).resolves.toBe('complete')
    await expect(fs.access(source)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('does not replace an existing destination', async () => {
    const source = path.join(tmpDir, 'source.txt')
    const destination = path.join(tmpDir, 'destination.txt')
    await Promise.all([writeFile(source, 'new'), writeFile(destination, 'existing')])

    await expect(moveFiles(source, destination, false)).rejects.toThrow('dest already exists.')

    await expect(readFile(source, 'utf8')).resolves.toBe('new')
    await expect(readFile(destination, 'utf8')).resolves.toBe('existing')
  })
})

describe(uniqueDatedFilePath.name, () => {
  let tmpDir: string

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-16T10:20:30.123Z'))
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'unique-dated-path-'))
  })

  afterEach(async () => {
    vi.useRealTimers()
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('increments an existing dated file name without changing its extension', async () => {
    const source = path.join(tmpDir, 'report.txt')
    const dated = path.join(tmpDir, 'report-2026.08.16 10-20-30.123.txt')
    const firstCollision = path.join(tmpDir, 'report-2026.08.16 10-20-30.123 (1).txt')
    await Promise.all([writeFile(source, 'source'), writeFile(dated, 'collision'), writeFile(firstCollision, 'collision')])

    await expect(uniqueDatedFilePath(source)).resolves.toEqual({
      isDir: false,
      path: path.join(tmpDir, 'report-2026.08.16 10-20-30.123 (2).txt')
    })
  })

  it('increments an existing dated directory name after its complete name', async () => {
    const source = path.join(tmpDir, 'documents.v1')
    const dated = path.join(tmpDir, 'documents.v1-2026.08.16 10-20-30.123')
    await Promise.all([fs.mkdir(source), fs.mkdir(dated), fs.mkdir(`${dated} (1)`)])

    await expect(uniqueDatedFilePath(source)).resolves.toEqual({
      isDir: true,
      path: `${dated} (2)`
    })
  })

  it('uses the known destination type when the protected trash source has a different type', async () => {
    const protectedDirectory = path.join(tmpDir, 'report.txt')
    await fs.mkdir(protectedDirectory)

    await expect(uniqueDatedFilePath(protectedDirectory, false)).resolves.toEqual({
      isDir: false,
      path: path.join(tmpDir, 'report-2026.08.16 10-20-30.123.txt')
    })
  })
})

describe(writeFromStream.name, () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'write-from-stream-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('writes at the requested offset without appending and accounts each chunk', async () => {
    const filePath = path.join(tmpDir, 'file.txt')
    const accountBytes = vi.fn()
    await writeFile(filePath, 'abc---')

    await writeFromStream(filePath, Readable.from([Buffer.from('de'), Buffer.from('f')]), { start: 3, accountBytes })

    await expect(readFile(filePath, 'utf8')).resolves.toBe('abcdef')
    expect(accountBytes).toHaveBeenNthCalledWith(1, 2)
    expect(accountBytes).toHaveBeenNthCalledWith(2, 1)
  })

  it('propagates a byte accounting error', async () => {
    const filePath = path.join(tmpDir, 'file.txt')

    await expect(
      writeFromStream(filePath, Readable.from([Buffer.from('abcd')]), {
        accountBytes: () => {
          throw storageQuotaExceededError()
        }
      })
    ).rejects.toMatchObject({
      httpCode: HttpStatus.INSUFFICIENT_STORAGE,
      message: FILE_ERROR.STORAGE_QUOTA_EXCEEDED,
      name: FileError.name
    })
  })

  it('aborts a stream when its signal is already aborted', async () => {
    const filePath = path.join(tmpDir, 'file.txt')
    const controller = new AbortController()
    controller.abort()

    await expect(writeFromStream(filePath, Readable.from([Buffer.from('abc')]), { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError'
    })
  })
})

describe(writeFromStreamAndChecksum.name, () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'write-from-stream-checksum-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('propagates a byte accounting error in checksum mode', async () => {
    const filePath = path.join(tmpDir, 'file.txt')

    await expect(
      writeFromStreamAndChecksum(filePath, Readable.from([Buffer.from('abcd')]), 'sha256', {
        accountBytes: () => {
          throw storageQuotaExceededError()
        }
      })
    ).rejects.toMatchObject({
      httpCode: HttpStatus.INSUFFICIENT_STORAGE,
      message: FILE_ERROR.STORAGE_QUOTA_EXCEEDED,
      name: FileError.name
    })
  })
})

describe('upload stream writers', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'write-upload-from-stream-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('uses the limiter offset and reports only accepted chunks', async () => {
    const filePath = path.join(tmpDir, 'file.txt')
    const onProgress = vi.fn()
    const limiter = new UploadStreamLimiter(6).createFileLimiter(3)
    await writeFile(filePath, 'abc')

    await writeUploadFromStream(filePath, Readable.from([Buffer.from('de'), Buffer.from('f')]), { limiter, onProgress })

    await expect(readFile(filePath, 'utf8')).resolves.toBe('abcdef')
    expect(onProgress).toHaveBeenNthCalledWith(1, 2)
    expect(onProgress).toHaveBeenNthCalledWith(2, 1)
  })

  it('does not report a chunk rejected by the limiter', async () => {
    const filePath = path.join(tmpDir, 'file.txt')
    const onProgress = vi.fn()
    const limiter = new UploadStreamLimiter(3).createFileLimiter()

    await expect(writeUploadFromStream(filePath, Readable.from([Buffer.from('abcd')]), { limiter, onProgress })).rejects.toMatchObject({
      httpCode: HttpStatus.PAYLOAD_TOO_LARGE,
      message: FILE_ERROR.MAX_FILE_SIZE_EXCEEDED,
      name: FileError.name
    })
    expect(onProgress).not.toHaveBeenCalled()
  })

  it('does not overwrite an existing file in exclusive mode', async () => {
    const filePath = path.join(tmpDir, 'file.txt')
    const limiter = new UploadStreamLimiter(1024).createFileLimiter()
    await writeFile(filePath, 'existing')

    await expect(writeUploadFromStream(filePath, Readable.from(['replacement']), { exclusive: true, limiter })).rejects.toMatchObject({
      code: 'EEXIST'
    })
    await expect(readFile(filePath, 'utf8')).resolves.toBe('existing')
  })

  it('enforces the limiter in checksum mode', async () => {
    const filePath = path.join(tmpDir, 'file.txt')
    const limiter = new UploadStreamLimiter(3).createFileLimiter()

    await expect(writeUploadFromStreamAndChecksum(filePath, Readable.from([Buffer.from('abcd')]), 'sha256', { limiter })).rejects.toMatchObject({
      httpCode: HttpStatus.PAYLOAD_TOO_LARGE,
      message: FILE_ERROR.MAX_FILE_SIZE_EXCEEDED,
      name: FileError.name
    })
  })
})

describe(temporaryFilePath.name, () => {
  it('uses the operation, execution id and sanitized basename', () => {
    const parentPath = path.join(path.sep, 'storage', '.sync-in-tmp')

    expect(temporaryFilePath(parentPath, 42, '../report.pdf', 'upload', 'task/id')).toBe(
      path.join(parentPath, 'server-user-42-upload-task-id-report.pdf')
    )
    expect(temporaryFilePrefix(42, 'compress', 'task-id')).toBe('server-user-42-compress-task-id-')
  })

  it('keeps generated names within the filesystem byte limit while preserving the extension', () => {
    const name = temporaryFileName(42, `${'é'.repeat(200)}.tar.gz`, 'compress', 'task-id')

    expect(Buffer.byteLength(name)).toBeLessThanOrEqual(255)
    expect(name.endsWith('.gz')).toBe(true)
  })
})

describe(serverTemporaryEntryUserId.name, () => {
  it('uses canonical positive user identifiers', () => {
    expect(serverTemporaryEntryPrefix(42)).toBe('server-user-42-')
    expect(serverTemporaryEntryUserId('server-user-42-upload-task-file')).toBe(42)
  })

  it.each(['desktop-client-download-file', 'server-user-0-upload-file', 'server-user-01-upload-file', 'server-user-9007199254740992-upload-file'])(
    'rejects an unmanaged or invalid entry: %s',
    (value) => expect(serverTemporaryEntryUserId(value)).toBeUndefined()
  )

  it.each([0, -1, Number.MAX_SAFE_INTEGER + 1])('rejects an invalid generated user identifier: %s', (userId) => {
    expect(() => serverTemporaryEntryPrefix(userId)).toThrow('Temporary-file user id must be a positive safe integer')
  })
})

describe(tryReflink.name, () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns true when the reflink succeeds', async () => {
    const copySpy = vi.spyOn(fs, 'copyFile').mockResolvedValueOnce(undefined)

    await expect(tryReflink('/src', '/dst')).resolves.toBe(true)
    expect(copySpy).toHaveBeenCalledWith('/src', '/dst', fs.constants.COPYFILE_FICLONE_FORCE)
  })

  it.each(['EOPNOTSUPP', 'EXDEV', 'EPERM'])('returns false on %s so the caller falls back to a regular copy', async (code) => {
    vi.spyOn(fs, 'copyFile').mockRejectedValueOnce(Object.assign(new Error(code), { code }))

    await expect(tryReflink('/src', '/dst')).resolves.toBe(false)
  })

  it('rethrows other errors', async () => {
    vi.spyOn(fs, 'copyFile').mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))

    await expect(tryReflink('/src', '/dst')).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
