import fs, { access, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import * as filesUtils from '../../utils/files'
import { taskTemporaryPrefix } from '../../utils/tasks'
import { FilesTasksTransfer } from './files-tasks-transfer.service'
import { SourceCleanupError } from '../../models/file-error'

describe(FilesTasksTransfer.name, () => {
  const cacheKey = 'ftask-7-task-id'
  let service: FilesTasksTransfer
  let tmpDir: string
  let srcPath: string
  let dstPath: string
  let stagingDir: string

  beforeEach(async () => {
    service = new FilesTasksTransfer()
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'file-tasks-'))
    srcPath = path.join(tmpDir, 'source.txt')
    dstPath = path.join(tmpDir, 'destination.txt')
    stagingDir = path.join(tmpDir, 'tasks')
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  const copyAbortable = (options: Record<string, any>) => (service as any).copyAbortable(srcPath, dstPath, options)
  const moveAbortable = (options: Record<string, any>) => (service as any).moveAbortable(srcPath, dstPath, options)

  const mockCrossDevice = () => {
    vi.spyOn(fs, 'lstat').mockResolvedValueOnce({ dev: 1 } as any)
    vi.spyOn(fs, 'stat').mockResolvedValueOnce({ dev: 2 } as any)
  }

  it('updates task size and progress through its public copy operation', async () => {
    const content = 'content'
    const srcSpace = {
      realPath: srcPath,
      task: { cacheKey, props: {} }
    } as any
    const dstSpace = { realPath: dstPath } as any
    await writeFile(srcPath, content)

    await service.copy({ tasksPath: stagingDir } as any, srcSpace, dstSpace, false, false, false, new AbortController().signal, vi.fn())

    expect(srcSpace.task.props).toMatchObject({
      progress: 100,
      size: Buffer.byteLength(content),
      totalSize: Buffer.byteLength(content)
    })
    await expect(readFile(dstPath, 'utf8')).resolves.toBe(content)
  })

  it('tracks extracted entries and implicit parent directories', () => {
    const space = {
      task: { cacheKey, props: { progress: 1 } }
    } as any
    const onEntry = service.createExtractionProgressHandler(space)

    onEntry({ path: 'docs/guides/readme.txt', isDirectory: false, size: 7 })
    onEntry({ path: 'docs/images/', isDirectory: true, size: 0 })
    onEntry({ path: 'docs/guides/second.txt', isDirectory: false, size: 5 })
    onEntry({ path: 'docs/guides/readme.txt', isDirectory: false, size: 9 })

    expect(space.task.props).toEqual({
      progress: 1,
      files: 2,
      directories: 3,
      size: 14
    })
  })

  it('publishes a copied file only after the commit hook', async () => {
    const signal = new AbortController().signal
    const temporaryPath = path.join(stagingDir, `${taskTemporaryPrefix(cacheKey)}destination.txt`)
    let transferredBytes = 0
    await writeFile(srcPath, 'content')

    await copyAbortable({
      beforeCommit: async () => {
        await expect(access(dstPath)).rejects.toMatchObject({ code: 'ENOENT' })
        await expect(readFile(temporaryPath, 'utf8')).resolves.toBe('content')
      },
      cacheKey,
      onTransferStart: vi.fn(),
      onProgress: (bytes: number) => {
        transferredBytes += bytes
      },
      signal,
      stagingDir
    })

    expect(transferredBytes).toBe(Buffer.byteLength('content'))
    expect(path.dirname(temporaryPath)).toBe(stagingDir)
    expect(path.basename(temporaryPath)).toBe(`${taskTemporaryPrefix(cacheKey)}destination.txt`)
    await expect(readFile(dstPath, 'utf8')).resolves.toBe('content')
    await expect(access(temporaryPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('cleans the temporary destination when copy is cancelled', async () => {
    const controller = new AbortController()
    await writeFile(srcPath, 'content')
    controller.abort()

    await expect(copyAbortable({ cacheKey, signal: controller.signal, stagingDir })).rejects.toMatchObject({ name: 'AbortError' })

    await expect(access(dstPath)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readdir(stagingDir)).resolves.toEqual([])
  })

  it('copies directly to a destination on another device', async () => {
    const signal = new AbortController().signal
    let transferStarted = false
    let destinationPrepared = false
    await writeFile(srcPath, 'content')
    mockCrossDevice()

    await copyAbortable({
      beforeCommit: async () => {
        destinationPrepared = true
      },
      cacheKey,
      onTransferStart: () => {
        expect(destinationPrepared).toBe(true)
        transferStarted = true
      },
      signal,
      stagingDir
    })

    expect(transferStarted).toBe(true)
    await expect(readFile(dstPath, 'utf8')).resolves.toBe('content')
    await expect(readdir(stagingDir)).resolves.toEqual([])
  })

  it('keeps an existing direct-copy destination when overwrite is rejected', async () => {
    const signal = new AbortController().signal
    await writeFile(srcPath, 'new content')
    await writeFile(dstPath, 'existing content')
    mockCrossDevice()

    await expect(copyAbortable({ cacheKey, signal, stagingDir })).rejects.toMatchObject({ code: 'EEXIST' })

    await expect(readFile(dstPath, 'utf8')).resolves.toBe('existing content')
  })

  it('does not prepare a direct-copy destination when already cancelled', async () => {
    const controller = new AbortController()
    const beforeCommit = vi.fn()
    await writeFile(srcPath, 'new content')
    await writeFile(dstPath, 'existing content')
    await fs.mkdir(stagingDir)
    controller.abort()
    mockCrossDevice()

    await expect(copyAbortable({ beforeCommit, cacheKey, overwrite: true, signal: controller.signal, stagingDir })).rejects.toMatchObject({
      name: 'AbortError'
    })

    expect(beforeCommit).not.toHaveBeenCalled()
    await expect(readFile(dstPath, 'utf8')).resolves.toBe('existing content')
  })

  it('preserves a direct-copy error when destination cleanup also fails', async () => {
    const signal = new AbortController().signal
    const transferError = Object.assign(new Error('transfer failed'), { code: 'EIO' })
    await fs.mkdir(stagingDir)
    vi.spyOn(fs, 'lstat').mockImplementation(async (rPath) => {
      if (rPath === stagingDir) return { dev: 1 } as any
      throw transferError
    })
    vi.spyOn(fs, 'stat').mockResolvedValueOnce({ dev: 2 } as any)
    vi.spyOn(filesUtils, 'removeFiles').mockRejectedValueOnce(new Error('cleanup failed'))

    await expect(copyAbortable({ cacheKey, signal, stagingDir })).rejects.toBe(transferError)
  })

  it('copies then removes the source for a cross-device move', async () => {
    const signal = new AbortController().signal
    await writeFile(srcPath, 'content')

    await moveAbortable({ cacheKey, crossDevice: true, signal, stagingDir })

    await expect(readFile(dstPath, 'utf8')).resolves.toBe('content')
    await expect(access(srcPath)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readdir(stagingDir)).resolves.toEqual([])
  })

  it('reports source cleanup failure after keeping the published destination', async () => {
    const signal = new AbortController().signal
    const error = new Error('source cleanup failed')
    await writeFile(srcPath, 'content')
    vi.spyOn(filesUtils, 'removeFiles').mockRejectedValueOnce(error)

    const cleanupError = await moveAbortable({ cacheKey, crossDevice: true, signal, stagingDir })

    expect(cleanupError).toBeInstanceOf(SourceCleanupError)
    expect(cleanupError).toMatchObject({
      cause: error,
      dstPath,
      message: 'Destination was published but the source could not be removed',
      name: SourceCleanupError.name,
      srcPath
    })
    await expect(readFile(srcPath, 'utf8')).resolves.toBe('content')
    await expect(readFile(dstPath, 'utf8')).resolves.toBe('content')
  })
})
