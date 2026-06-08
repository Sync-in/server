import fs, { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { FILE_OPERATION } from '../constants/operations'
import { createTaskTemporaryDir, isTaskCancellable, taskTemporaryPath, taskTemporaryPrefix } from './tasks'

describe('file task utilities', () => {
  const cacheKey = 'ftask-7-task-id'
  let tmpDir: string
  let srcPath: string
  let dstPath: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'file-tasks-'))
    srcPath = path.join(tmpDir, 'source.txt')
    dstPath = path.join(tmpDir, 'destination.txt')
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

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

    expect(path.basename(filePath)).toBe(`${taskTemporaryPrefix(cacheKey)}report.txt`)
    expect(path.basename(directoryPath)).toBe(`${taskTemporaryPrefix(cacheKey)}archive`)
    expect((await fs.stat(directoryPath)).isDirectory()).toBe(true)
  })
})
