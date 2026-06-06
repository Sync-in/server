import fs, { access, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { FILE_OPERATION } from '../constants/operations'
import * as filesUtils from './files'
import { copyAbortable, createTaskTemporaryDir, isTaskCancellable, moveAbortable, SourceCleanupError, taskTemporaryPath } from './tasks'

describe('abortable file tasks', () => {
  const cacheKey = 'ftask-7-task-id'
  let tmpDir: string
  let srcPath: string
  let dstPath: string
  let stagingDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'file-tasks-'))
    srcPath = path.join(tmpDir, 'source.txt')
    dstPath = path.join(tmpDir, 'destination.txt')
    stagingDir = path.join(tmpDir, 'tasks')
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  const mockCrossDevice = () => {
    vi.spyOn(fs, 'lstat').mockResolvedValueOnce({ dev: 1 } as any)
    vi.spyOn(fs, 'stat').mockResolvedValueOnce({ dev: 2 } as any)
  }

  it('marks intrinsically abortable operations as cancellable', async () => {
    await expect(isTaskCancellable(FILE_OPERATION.COPY, '/source')).resolves.toBe(true)
    await expect(isTaskCancellable(FILE_OPERATION.DOWNLOAD, '/source')).resolves.toBe(true)
  })

  it('requires a cross-device destination for move and delete', async () => {
    await writeFile(srcPath, 'content')
    const lstatSpy = vi.spyOn(fs, 'lstat')
    const statSpy = vi.spyOn(fs, 'stat')
    lstatSpy.mockResolvedValueOnce({ dev: 1 } as any)
    statSpy.mockResolvedValueOnce({ dev: 2 } as any)

    await expect(isTaskCancellable(FILE_OPERATION.MOVE, srcPath, dstPath)).resolves.toBe(true)
    lstatSpy.mockResolvedValueOnce({ dev: 1 } as any)
    statSpy.mockResolvedValueOnce({ dev: 2 } as any)
    await expect(isTaskCancellable(FILE_OPERATION.DELETE, srcPath, dstPath)).resolves.toBe(true)
    await expect(isTaskCancellable(FILE_OPERATION.DELETE, srcPath)).resolves.toBe(false)
    expect(lstatSpy).toHaveBeenCalledWith(srcPath)
  })

  it('uses a uniform task staging name for files and directories', async () => {
    const filePath = taskTemporaryPath(tmpDir, cacheKey, '/destination/report.txt')
    const directoryPath = await createTaskTemporaryDir(tmpDir, cacheKey, '/destination/archive')

    expect(path.basename(filePath)).toBe(`.${cacheKey}-report.txt`)
    expect(path.basename(directoryPath)).toBe(`.${cacheKey}-archive`)
    expect((await fs.stat(directoryPath)).isDirectory()).toBe(true)
  })

  it('publishes a copied file only after the commit hook', async () => {
    const signal = new AbortController().signal
    let temporaryPath = ''
    await writeFile(srcPath, 'content')

    await copyAbortable(srcPath, dstPath, {
      beforeCommit: async () => {
        await expect(access(dstPath)).rejects.toMatchObject({ code: 'ENOENT' })
        await expect(readFile(temporaryPath, 'utf8')).resolves.toBe('content')
      },
      cacheKey,
      onTransferStart: (value) => {
        temporaryPath = value
      },
      signal,
      stagingDir
    })

    expect(path.dirname(temporaryPath)).toBe(stagingDir)
    expect(path.basename(temporaryPath)).toBe(`.${cacheKey}-destination.txt`)
    await expect(readFile(dstPath, 'utf8')).resolves.toBe('content')
    await expect(access(temporaryPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('cleans the temporary destination when copy is cancelled', async () => {
    const controller = new AbortController()
    await writeFile(srcPath, 'content')
    controller.abort()

    await expect(copyAbortable(srcPath, dstPath, { cacheKey, signal: controller.signal, stagingDir })).rejects.toMatchObject({
      name: 'AbortError'
    })

    await expect(access(dstPath)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readdir(stagingDir)).resolves.toEqual([])
  })

  it('copies directly to a destination on another device', async () => {
    const signal = new AbortController().signal
    let watchedPath = ''
    let destinationPrepared = false
    await writeFile(srcPath, 'content')
    mockCrossDevice()

    await copyAbortable(srcPath, dstPath, {
      beforeCommit: async () => {
        destinationPrepared = true
      },
      cacheKey,
      onTransferStart: (value) => {
        expect(destinationPrepared).toBe(true)
        watchedPath = value
      },
      signal,
      stagingDir
    })

    expect(watchedPath).toBe(dstPath)
    await expect(readFile(dstPath, 'utf8')).resolves.toBe('content')
    await expect(readdir(stagingDir)).resolves.toEqual([])
  })

  it('keeps an existing direct-copy destination when overwrite is rejected', async () => {
    const signal = new AbortController().signal
    await writeFile(srcPath, 'new content')
    await writeFile(dstPath, 'existing content')
    mockCrossDevice()

    await expect(copyAbortable(srcPath, dstPath, { cacheKey, signal, stagingDir })).rejects.toMatchObject({ code: 'EEXIST' })

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

    await expect(
      copyAbortable(srcPath, dstPath, { beforeCommit, cacheKey, overwrite: true, signal: controller.signal, stagingDir })
    ).rejects.toMatchObject({ name: 'AbortError' })

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

    await expect(copyAbortable(srcPath, dstPath, { cacheKey, signal, stagingDir })).rejects.toBe(transferError)
  })

  it('copies then removes the source for a cross-device move', async () => {
    const signal = new AbortController().signal
    await writeFile(srcPath, 'content')

    await moveAbortable(srcPath, dstPath, { cacheKey, crossDevice: true, signal, stagingDir })

    await expect(readFile(dstPath, 'utf8')).resolves.toBe('content')
    await expect(access(srcPath)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readdir(stagingDir)).resolves.toEqual([])
  })

  it('reports source cleanup failure after keeping the published destination', async () => {
    const signal = new AbortController().signal
    const error = new Error('source cleanup failed')
    await writeFile(srcPath, 'content')
    vi.spyOn(filesUtils, 'removeFiles').mockRejectedValueOnce(error)

    const cleanupError = await moveAbortable(srcPath, dstPath, { cacheKey, crossDevice: true, signal, stagingDir })

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
