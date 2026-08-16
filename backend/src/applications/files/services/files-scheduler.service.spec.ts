import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { FILE_OPERATION } from '../constants/operations'
import { FilesScheduler } from './files-scheduler.service'

describe(FilesScheduler.name, () => {
  let cache: { keys: ReturnType<typeof vi.fn>; mget: ReturnType<typeof vi.fn> }
  let service: FilesScheduler
  let temporaryPath: string

  beforeEach(async () => {
    cache = {
      keys: vi.fn().mockResolvedValue([]),
      mget: vi.fn().mockResolvedValue([])
    }
    service = new FilesScheduler({} as any, cache as any, {} as any, {} as any, {} as any, {} as any, {} as any)
    temporaryPath = await fs.mkdtemp(path.join(os.tmpdir(), 'files-scheduler-'))
  })

  afterEach(async () => {
    await fs.rm(temporaryPath, { recursive: true, force: true })
  })

  it('cleans expired home entries while preserving current task artifacts', async () => {
    const expiration = Date.now() - 1_000
    const legacyPath = path.join(temporaryPath, 'legacy.tmp')
    const orphanPath = path.join(temporaryPath, '~tmp-upload-orphan-report.txt')
    const activePath = path.join(temporaryPath, '~tmp-copy-active-report.txt')
    const recentPath = path.join(temporaryPath, 'recent.tmp')
    await Promise.all([
      fs.writeFile(legacyPath, 'legacy'),
      fs.writeFile(orphanPath, 'orphan'),
      fs.writeFile(activePath, 'active'),
      fs.writeFile(recentPath, 'recent')
    ])
    const expired = new Date(expiration - 1_000)
    await Promise.all([fs.utimes(legacyPath, expired, expired), fs.utimes(orphanPath, expired, expired), fs.utimes(activePath, expired, expired)])
    cache.keys.mockResolvedValue(['ftask-7-active'])
    cache.mget.mockResolvedValue([{ id: 'active', type: FILE_OPERATION.COPY }])

    await (service as any).cleanupTemporaryDirectories(7, [{ includeLegacyEntries: true, path: temporaryPath }], expiration)

    await expect(fs.readdir(temporaryPath).then((entries) => entries.sort())).resolves.toEqual(['recent.tmp', '~tmp-copy-active-report.txt'])
  })

  it('does not query tasks or remove legacy names from target temporary roots', async () => {
    const legacyPath = path.join(temporaryPath, 'legacy.tmp')
    await fs.writeFile(legacyPath, 'legacy')
    const expired = new Date(0)
    await fs.utimes(legacyPath, expired, expired)

    await (service as any).cleanupTemporaryDirectories(7, [{ includeLegacyEntries: false, path: temporaryPath }], Date.now())

    await expect(fs.readdir(temporaryPath)).resolves.toEqual(['legacy.tmp'])
    expect(cache.keys).not.toHaveBeenCalled()
  })

  it('keeps artifacts created in a later directory while task prefixes are being resolved', async () => {
    const expiration = Date.now() - 1_000
    const firstPath = path.join(temporaryPath, 'first')
    const secondPath = path.join(temporaryPath, 'second')
    const orphanPath = path.join(firstPath, '~tmp-copy-orphan-report.txt')
    const concurrentPath = path.join(secondPath, '~tmp-copy-concurrent-report.txt')
    await Promise.all([fs.mkdir(firstPath), fs.mkdir(secondPath)])
    await fs.writeFile(orphanPath, 'orphan')
    const expired = new Date(expiration - 1_000)
    await fs.utimes(orphanPath, expired, expired)
    cache.keys.mockImplementationOnce(async () => {
      await fs.writeFile(concurrentPath, 'concurrent')
      await fs.utimes(concurrentPath, expired, expired)
      return []
    })

    await (service as any).cleanupTemporaryDirectories(
      7,
      [
        { includeLegacyEntries: false, path: firstPath },
        { includeLegacyEntries: false, path: secondPath }
      ],
      expiration
    )

    await expect(fs.readdir(firstPath)).resolves.toEqual([])
    await expect(fs.readdir(secondPath)).resolves.toEqual(['~tmp-copy-concurrent-report.txt'])
    expect(cache.keys).toHaveBeenCalledOnce()
  })
})
