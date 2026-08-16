import fs, { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { FILE_OPERATION } from '../constants/operations'
import { countDirEntriesAndSize, isTaskCancellable } from './tasks'

describe('file task utilities', () => {
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

  it('counts task content while ignoring internal temporary entries', async () => {
    const sourceDir = path.join(tmpDir, 'source')
    await fs.mkdir(path.join(sourceDir, 'docs'), { recursive: true })
    await fs.mkdir(path.join(sourceDir, '.sync-in-tmp', 'users', '7'), { recursive: true })
    await fs.mkdir(path.join(sourceDir, '.sync-in.partial-dir'), { recursive: true })
    await Promise.all([
      writeFile(path.join(sourceDir, 'report.txt'), 'report'),
      writeFile(path.join(sourceDir, 'docs', 'notes.txt'), 'notes'),
      writeFile(path.join(sourceDir, '.sync-in.report.txt'), 'ignored'),
      writeFile(path.join(sourceDir, '.sync-in-tmp', 'users', '7', 'staging.bin'), 'ignored'),
      writeFile(path.join(sourceDir, '.sync-in.partial-dir', 'chunk.bin'), 'ignored')
    ])

    await expect(countDirEntriesAndSize(sourceDir)).resolves.toEqual({
      directories: 1,
      files: 2,
      size: Buffer.byteLength('reportnotes')
    })
  })
})
