import { HttpStatus } from '@nestjs/common'
import fs, { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import fse from 'fs-extra'
import type { MockInstance } from 'vitest'
import { FileError } from '../models/file-error'
import { storageQuotaExceededError } from './errors'
import { createSizeLimiter, isCrossDevice, isPathInside, makeTempDir, tempFilePath, writeFromStream } from './files'
import { FILE_ERROR } from '../constants/errors'

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

describe(writeFromStream.name, () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'write-from-stream-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('writes from an offset up to the max size and reports progress', async () => {
    const filePath = path.join(tmpDir, 'file.txt')
    const onProgress = vi.fn()
    await writeFile(filePath, 'abc')

    await writeFromStream(filePath, Readable.from([Buffer.from('de'), Buffer.from('f')]), 3, 6, undefined, onProgress)

    await expect(readFile(filePath, 'utf8')).resolves.toBe('abcdef')
    expect(onProgress).toHaveBeenNthCalledWith(1, 2)
    expect(onProgress).toHaveBeenNthCalledWith(2, 1)
  })

  it('rejects a stream exceeding the max size', async () => {
    const filePath = path.join(tmpDir, 'file.txt')

    await expect(writeFromStream(filePath, Readable.from([Buffer.from('abcd')]), 0, 3)).rejects.toMatchObject({
      httpCode: HttpStatus.PAYLOAD_TOO_LARGE,
      message: FILE_ERROR.MAX_FILE_SIZE_EXCEEDED,
      name: FileError.name
    })
  })

  it('aborts a stream when its signal is already aborted', async () => {
    const filePath = path.join(tmpDir, 'file.txt')
    const controller = new AbortController()
    controller.abort()

    await expect(writeFromStream(filePath, Readable.from([Buffer.from('abc')]), 0, undefined, controller.signal)).rejects.toMatchObject({
      name: 'AbortError'
    })
  })
})

describe(makeTempDir.name, () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'make-temp-dir-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('creates distinct directories with the requested prefix', async () => {
    const firstPath = await makeTempDir(tmpDir, 'extract-')
    const secondPath = await makeTempDir(tmpDir, 'extract-')

    expect(firstPath).not.toBe(secondPath)
    expect(path.basename(firstPath)).toMatch(/^extract-/)
    await expect(access(firstPath)).resolves.toBeUndefined()
    await expect(access(secondPath)).resolves.toBeUndefined()
  })
})

describe(tempFilePath.name, () => {
  it('returns safe distinct paths with the requested parent and prefix', () => {
    const parentPath = path.join(path.sep, 'tmp', 'user')
    const firstPath = tempFilePath(parentPath, 'archive-compress-')
    const secondPath = tempFilePath(parentPath, 'archive-compress-')

    expect(firstPath).not.toBe(secondPath)
    expect(path.dirname(firstPath)).toBe(parentPath)
    expect(path.basename(firstPath)).toMatch(/^archive-compress-/)
    expect(path.dirname(tempFilePath(parentPath, path.join('..', 'archive-')))).toBe(parentPath)
  })
})
