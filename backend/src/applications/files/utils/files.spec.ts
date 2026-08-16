import { HttpStatus } from '@nestjs/common'
import fs, { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import fse from 'fs-extra'
import type { MockInstance } from 'vitest'
import { FileError } from '../models/file-error'
import { storageQuotaExceededError } from './errors'
import {
  createSizeLimiter,
  isCrossDevice,
  isInternalTemporaryEntry,
  isInternalTemporaryPath,
  isPathInside,
  sanitizeName,
  temporaryFileName,
  temporaryFilePath,
  temporaryFilePrefix,
  uniqueDatedFilePath,
  writeFromStream,
  writeFromStreamAndChecksum,
  writeUploadFromStream,
  writeUploadFromStreamAndChecksum
} from './files'
import { FILE_ERROR } from '../constants/errors'
import { UploadStreamLimiter } from './upload-file'

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

describe(isInternalTemporaryEntry.name, () => {
  it('reserves storage and Sync temporary names only', () => {
    expect(isInternalTemporaryEntry('.sync-in-tmp')).toBe(true)
    expect(isInternalTemporaryEntry('.sync-in.uploading')).toBe(true)
    expect(isInternalTemporaryEntry('.sync-in')).toBe(false)
    expect(isInternalTemporaryEntry('.sync-in-tmp-user')).toBe(false)
  })

  it('checks path segments relative to the exposed repository root', () => {
    const basePath = path.join(path.sep, 'data', 'users', '.sync-in.user')

    expect(isInternalTemporaryPath(basePath, path.join(basePath, 'documents', '.sync-in.uploading'))).toBe(true)
    expect(isInternalTemporaryPath(basePath, path.join(basePath, 'documents'))).toBe(false)
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

describe(isCrossDevice.name, () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('compares the source device with the nearest existing destination parent', async () => {
    vi.spyOn(fs, 'lstat').mockResolvedValueOnce({ dev: 1 } as any)
    const statSpy = vi.spyOn(fs, 'stat').mockResolvedValueOnce({ dev: 2 } as any)
    const pathExistsSpy = vi.spyOn(fse, 'pathExists') as unknown as MockInstance<(path: string) => Promise<boolean>>
    pathExistsSpy.mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const dstPath = path.join(path.sep, 'missing', 'parent', 'destination.txt')

    await expect(isCrossDevice('/source.txt', dstPath)).resolves.toBe(true)

    expect(statSpy).toHaveBeenCalledWith(path.parse(dstPath).root)
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

  it('writes from an offset and accounts each chunk', async () => {
    const filePath = path.join(tmpDir, 'file.txt')
    const accountBytes = vi.fn()
    await writeFile(filePath, 'abc')

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
    const parentPath = path.join(path.sep, 'storage', '.sync-in-tmp', 'users', '42')

    expect(temporaryFilePath(parentPath, '../report.pdf', 'upload', 'task/id')).toBe(path.join(parentPath, '~tmp-upload-task-id-report.pdf'))
    expect(temporaryFilePrefix('compress', 'task-id')).toBe('~tmp-compress-task-id-')
  })

  it('keeps generated names within the filesystem byte limit while preserving the extension', () => {
    const name = temporaryFileName(`${'é'.repeat(200)}.tar.gz`, 'compress', 'task-id')

    expect(Buffer.byteLength(name)).toBeLessThanOrEqual(255)
    expect(name.endsWith('.gz')).toBe(true)
  })
})
