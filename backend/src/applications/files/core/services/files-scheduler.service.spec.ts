import { Logger } from '@nestjs/common'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { USER_ROLE } from '../../../users/constants/user.js'
import { UserModel } from '../../../users/models/user.model.js'
import { TEMPORARY_PATH } from '../constants/files.js'
import { FILE_OPERATION } from '../constants/operations.js'
import { FILE_UPLOAD_SESSION, FILE_UPLOAD_SESSION_MAX_AGE_MS } from '../../operations/constants/upload-session.js'
import { FilesUploadSessionManager } from '../../operations/services/files-upload-session-manager.service.js'
import { FilesScheduler } from './files-scheduler.service.js'

describe(FilesScheduler.name, () => {
  Logger.overrideLogger(['fatal'])

  let cache: {
    keys: ReturnType<typeof vi.fn>
    mget: ReturnType<typeof vi.fn>
  }
  let service: FilesScheduler
  let temporaryPath: string

  beforeEach(async () => {
    vi.clearAllMocks()
    cache = {
      keys: vi.fn().mockResolvedValue([]),
      mget: vi.fn().mockResolvedValue([])
    }
    service = new FilesScheduler(
      {} as any,
      cache as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      new FilesUploadSessionManager({} as any, {} as any)
    )
    temporaryPath = await fs.mkdtemp(path.join(os.tmpdir(), 'files-scheduler-'))
  })

  afterEach(async () => {
    await fs.rm(temporaryPath, { recursive: true, force: true })
  })

  it('discovers personal and external temporary roots without actor directories', async () => {
    await fs.mkdir(path.join(temporaryPath, TEMPORARY_PATH.STORAGE))
    Object.assign(service as any, {
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockResolvedValue([{ id: 7, login: 'alice', role: USER_ROLE.USER }])
        })
      },
      spacesQueries: { spacesQuotaPaths: vi.fn().mockResolvedValue([{ externalPaths: [temporaryPath] }]) },
      sharesQueries: { sharesQuotaExternalPaths: vi.fn().mockResolvedValue([]) }
    })
    const discoverTemporaryRoot = vi.spyOn(service as any, 'discoverTemporaryRoot').mockResolvedValue(undefined)

    await service.cleanupUserTmpFiles()

    expect(discoverTemporaryRoot).toHaveBeenCalledWith(UserModel.getTmpPath('alice'), expect.any(Map))
    expect(discoverTemporaryRoot).toHaveBeenCalledWith(path.join(temporaryPath, TEMPORARY_PATH.STORAGE), expect.any(Map))
  })

  it('discovers external temporary roots referenced by shares', async () => {
    await fs.mkdir(path.join(temporaryPath, TEMPORARY_PATH.STORAGE))
    Object.assign(service as any, {
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockResolvedValue([])
        })
      },
      spacesQueries: { spacesQuotaPaths: vi.fn().mockResolvedValue([]) },
      sharesQueries: { sharesQuotaExternalPaths: vi.fn().mockResolvedValue([{ externalPath: temporaryPath }]) }
    })
    const discoverTemporaryRoot = vi.spyOn(service as any, 'discoverTemporaryRoot').mockResolvedValue(undefined)

    await service.cleanupUserTmpFiles()

    expect(discoverTemporaryRoot).toHaveBeenCalledWith(path.join(temporaryPath, TEMPORARY_PATH.STORAGE), expect.any(Map))
  })

  it('does not traverse a symlinked external temporary root', async () => {
    const externalRoot = path.join(temporaryPath, 'external')
    const symlinkTarget = path.join(temporaryPath, 'outside')
    const orphanPath = path.join(symlinkTarget, 'server-user-7-upload-orphan-report.txt')
    await Promise.all([fs.mkdir(externalRoot), fs.mkdir(symlinkTarget)])
    await fs.writeFile(orphanPath, 'orphan')
    await fs.utimes(orphanPath, new Date(0), new Date(0))
    const symlinkedTemporaryRoot = path.join(externalRoot, TEMPORARY_PATH.STORAGE)
    await fs.symlink(symlinkTarget, symlinkedTemporaryRoot, 'dir')
    Object.assign(service as any, {
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockResolvedValue([])
        })
      },
      spacesQueries: { spacesQuotaPaths: vi.fn().mockResolvedValue([{ externalPaths: [externalRoot] }]) },
      sharesQueries: { sharesQuotaExternalPaths: vi.fn().mockResolvedValue([]) }
    })
    const temporaryDirectories = new Map()

    await (service as any).discoverTemporaryRoot(symlinkedTemporaryRoot, temporaryDirectories)

    await service.cleanupUserTmpFiles()

    expect(temporaryDirectories.size).toBe(0)
    await expect(fs.readFile(orphanPath, 'utf8')).resolves.toBe('orphan')
    expect(cache.keys).not.toHaveBeenCalled()
  })

  it('cleans expired server entries while preserving current tasks, recent entries and foreign namespaces', async () => {
    const expiration = Date.now() - 1_000
    const legacyPath = path.join(temporaryPath, 'legacy.tmp')
    const desktopPath = path.join(temporaryPath, 'desktop-client-sync-path-1-download-transfer.part')
    const orphanPath = path.join(temporaryPath, 'server-user-7-upload-orphan-report.txt')
    const activePath = path.join(temporaryPath, 'server-user-7-copy-active-report.txt')
    const recentPath = path.join(temporaryPath, 'server-user-7-upload-recent-report.txt')
    await Promise.all([
      fs.writeFile(legacyPath, 'legacy'),
      fs.writeFile(desktopPath, 'desktop'),
      fs.writeFile(orphanPath, 'orphan'),
      fs.writeFile(activePath, 'active'),
      fs.writeFile(recentPath, 'recent')
    ])
    const expired = new Date(expiration - 1_000)
    await Promise.all([
      fs.utimes(legacyPath, expired, expired),
      fs.utimes(desktopPath, expired, expired),
      fs.utimes(orphanPath, expired, expired),
      fs.utimes(activePath, expired, expired)
    ])
    cache.keys.mockResolvedValue(['ftask-7-active'])
    cache.mget.mockResolvedValue([{ id: 'active', type: FILE_OPERATION.COPY }])

    await cleanupDiscoveredUser(7, expiration)

    await expect(fs.readdir(temporaryPath).then((entries) => entries.sort())).resolves.toEqual(
      [
        'desktop-client-sync-path-1-download-transfer.part',
        'legacy.tmp',
        'server-user-7-copy-active-report.txt',
        'server-user-7-upload-recent-report.txt'
      ].sort()
    )
  })

  it('ignores malformed server prefixes and entries owned by another product', async () => {
    const names = [
      'desktop-client-sync-path-1-download-transfer.part',
      'legacy.tmp',
      'server-user-0-upload-transfer-file',
      'server-user-07-upload-transfer-file',
      'server-user-9007199254740992-upload-transfer-file'
    ]
    await Promise.all(names.map((name) => fs.writeFile(path.join(temporaryPath, name), name)))
    const temporaryDirectories = new Map()

    await (service as any).discoverTemporaryRoot(temporaryPath, temporaryDirectories)

    expect(temporaryDirectories.size).toBe(0)
    await expect(fs.readdir(temporaryPath).then((entries) => entries.sort())).resolves.toEqual([...names].sort())
    expect(cache.keys).not.toHaveBeenCalled()
  })

  it('separates actor prefixes and protects shared-storage artifacts with the matching task cache', async () => {
    const activePath = path.join(temporaryPath, 'server-user-42-copy-active-report.txt')
    const otherActorPath = path.join(temporaryPath, 'server-user-420-copy-orphan-report.txt')
    await fs.writeFile(activePath, 'active')
    await fs.writeFile(otherActorPath, 'other')
    await Promise.all([fs.utimes(activePath, new Date(0), new Date(0)), fs.utimes(otherActorPath, new Date(0), new Date(0))])
    cache.keys.mockResolvedValue(['ftask-42-active'])
    cache.mget.mockResolvedValue([{ id: 'active', type: FILE_OPERATION.COPY }])
    const temporaryDirectories = new Map()

    await (service as any).discoverTemporaryRoot(temporaryPath, temporaryDirectories)
    await (service as any).cleanupTemporaryDirectories(42, [...temporaryDirectories.get(42).values()], Date.now())

    await expect(fs.readFile(activePath, 'utf8')).resolves.toBe('active')
    await expect(fs.readFile(otherActorPath, 'utf8')).resolves.toBe('other')
    expect([...temporaryDirectories.keys()].sort((a, b) => a - b)).toEqual([42, 420])
    expect(cache.keys).toHaveBeenCalledWith('ftask-42-*')
  })

  it('preserves an expired upload session while a recent operation owns its lock', async () => {
    const sessionPath = path.join(temporaryPath, 'server-user-7-upload-00000000-0000-4000-8000-000000000000-session')
    await fs.mkdir(sessionPath)
    await fs.writeFile(path.join(sessionPath, FILE_UPLOAD_SESSION.LOCK), '00000000-0000-4000-8000-000000000003')
    const expired = new Date(0)
    await fs.utimes(sessionPath, expired, expired)

    await cleanupDiscoveredUser(7, Date.now() - 1_000)

    await expect(fs.stat(sessionPath)).resolves.toBeDefined()
  })

  it('cleans an expired upload session with an abandoned lock', async () => {
    const sessionPath = path.join(temporaryPath, 'server-user-7-upload-00000000-0000-4000-8000-000000000000-session')
    await fs.mkdir(sessionPath)
    const manifestPath = path.join(sessionPath, FILE_UPLOAD_SESSION.MANIFEST)
    const payloadPath = path.join(sessionPath, FILE_UPLOAD_SESSION.PAYLOAD)
    const lockPath = path.join(sessionPath, FILE_UPLOAD_SESSION.LOCK)
    await Promise.all([fs.writeFile(manifestPath, '{}'), fs.writeFile(payloadPath, ''), fs.writeFile(lockPath, crypto.randomUUID())])
    const expired = new Date(0)
    await Promise.all([
      fs.utimes(sessionPath, expired, expired),
      fs.utimes(manifestPath, expired, expired),
      fs.utimes(payloadPath, expired, expired),
      fs.utimes(lockPath, expired, expired)
    ])

    await cleanupDiscoveredUser(7, Date.now() - 1_000)

    await expect(fs.stat(sessionPath)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(cache.keys).not.toHaveBeenCalled()
  })

  it('cleans a session past its absolute lifetime even when HEAD-like claim activity refreshed the directory', async () => {
    const sessionPath = path.join(temporaryPath, 'server-user-7-upload-00000000-0000-4000-8000-000000000000-session')
    await fs.mkdir(sessionPath)
    const manifestPath = path.join(sessionPath, FILE_UPLOAD_SESSION.MANIFEST)
    await fs.writeFile(manifestPath, '{}')
    await fs.writeFile(path.join(sessionPath, FILE_UPLOAD_SESSION.PAYLOAD), '')
    const expired = new Date(Date.now() - FILE_UPLOAD_SESSION_MAX_AGE_MS - 1_000)
    await fs.utimes(manifestPath, expired, expired)
    await fs.utimes(sessionPath, new Date(), new Date())

    await cleanupDiscoveredUser(7, Date.now() - 86_400_000)

    await expect(fs.stat(sessionPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('keeps artifacts created in a later directory while task prefixes are being resolved', async () => {
    const expiration = Date.now() - 1_000
    const firstPath = path.join(temporaryPath, 'first')
    const secondPath = path.join(temporaryPath, 'second')
    const orphanPath = path.join(firstPath, 'server-user-7-copy-orphan-report.txt')
    const concurrentPath = path.join(secondPath, 'server-user-7-copy-concurrent-report.txt')
    await Promise.all([fs.mkdir(firstPath), fs.mkdir(secondPath)])
    await fs.writeFile(orphanPath, 'orphan')
    const expired = new Date(expiration - 1_000)
    await fs.utimes(orphanPath, expired, expired)
    cache.keys.mockImplementationOnce(async () => {
      await fs.writeFile(concurrentPath, 'concurrent')
      await fs.utimes(concurrentPath, expired, expired)
      return []
    })

    const temporaryDirectories = new Map()
    await (service as any).discoverTemporaryRoot(firstPath, temporaryDirectories)
    await (service as any).discoverTemporaryRoot(secondPath, temporaryDirectories)
    await (service as any).cleanupTemporaryDirectories(7, [...temporaryDirectories.get(7).values()], expiration)

    await expect(fs.readdir(firstPath)).resolves.toEqual([])
    await expect(fs.readdir(secondPath)).resolves.toEqual(['server-user-7-copy-concurrent-report.txt'])
    expect(cache.keys).toHaveBeenCalledOnce()
  })

  async function cleanupDiscoveredUser(userId: number, expiration: number): Promise<void> {
    const temporaryDirectories = new Map()
    await (service as any).discoverTemporaryRoot(temporaryPath, temporaryDirectories)
    await (service as any).cleanupTemporaryDirectories(userId, [...temporaryDirectories.get(userId).values()], expiration)
  }
})
