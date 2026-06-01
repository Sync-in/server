import { HttpStatus } from '@nestjs/common'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { FileError } from '../models/file-error'
import { FILE_ERROR_MESSAGES } from './errors'
import { isPathInside, makeTempDir, tempFilePath, writeFromStream } from './files'

describe(isPathInside.name, () => {
  const basePath = path.join(path.sep, 'tmp', 'output')

  it('accepts paths inside the base path', () => {
    expect(isPathInside(basePath, path.join(basePath, 'safe', 'file.txt'))).toBe(true)
  })

  it('accepts the base path only when explicitly allowed', () => {
    expect(isPathInside(basePath, basePath)).toBe(false)
    expect(isPathInside(basePath, basePath, true)).toBe(true)
    expect(isPathInside(path.parse(basePath).root, path.parse(basePath).root)).toBe(false)
  })

  it.each([path.join(basePath, '..', 'zip-slip-proof.txt'), path.join(path.sep, 'tmp', 'output-evil', 'file.txt')])(
    'rejects path "%s"',
    (candidatePath) => {
      expect(isPathInside(basePath, candidatePath)).toBe(false)
    }
  )
})

describe(writeFromStream.name, () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'write-from-stream-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('writes a stream matching the max size', async () => {
    const filePath = path.join(tmpDir, 'file.txt')

    await writeFromStream(filePath, Readable.from([Buffer.from('abc')]), 0, 3)

    await expect(readFile(filePath, 'utf8')).resolves.toBe('abc')
  })

  it('rejects a stream exceeding the max size', async () => {
    const filePath = path.join(tmpDir, 'file.txt')

    await expect(writeFromStream(filePath, Readable.from([Buffer.from('abcd')]), 0, 3)).rejects.toMatchObject({
      httpCode: HttpStatus.PAYLOAD_TOO_LARGE,
      message: FILE_ERROR_MESSAGES.MAX_FILE_SIZE_EXCEEDED,
      name: FileError.name
    })
  })

  it('accounts for the existing start offset', async () => {
    const filePath = path.join(tmpDir, 'file.txt')
    await writeFile(filePath, 'abc')

    await writeFromStream(filePath, Readable.from([Buffer.from('de')]), 3, 5)

    await expect(readFile(filePath, 'utf8')).resolves.toBe('abcde')
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
  it('returns distinct paths with the requested parent and prefix', () => {
    const parentPath = path.join(path.sep, 'tmp', 'user')
    const firstPath = tempFilePath(parentPath, 'archive-compress-')
    const secondPath = tempFilePath(parentPath, 'archive-compress-')

    expect(firstPath).not.toBe(secondPath)
    expect(path.dirname(firstPath)).toBe(parentPath)
    expect(path.basename(firstPath)).toMatch(/^archive-compress-/)
  })

  it('keeps paths with traversal prefixes inside the requested parent', () => {
    const parentPath = path.join(path.sep, 'tmp', 'user')

    expect(path.dirname(tempFilePath(parentPath, path.join('..', 'archive-')))).toBe(parentPath)
  })
})
