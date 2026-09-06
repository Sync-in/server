import fs, { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { FILE_OPERATION } from '../constants/operations'
import { countDirEntriesAndSize, isTaskCancellable } from './tasks'

describe('file task utilities', () => {
  let tmpDir: string
  let dstPath: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'file-tasks-'))
    dstPath = path.join(tmpDir, 'destination.txt')
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('marks intrinsically abortable operations as cancellable', () => {
    expect(isTaskCancellable(FILE_OPERATION.COPY)).toBe(true)
    expect(isTaskCancellable(FILE_OPERATION.DOWNLOAD)).toBe(true)
  })

  it('marks moves and trash deletes as cancellable when their destination is known', () => {
    expect(isTaskCancellable(FILE_OPERATION.MOVE, dstPath)).toBe(true)
    expect(isTaskCancellable(FILE_OPERATION.DELETE, dstPath)).toBe(true)
    expect(isTaskCancellable(FILE_OPERATION.DELETE)).toBe(false)
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
