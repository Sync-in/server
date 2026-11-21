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

  it('keeps the deprecated personal staging root discoverable until the next major release', async () => {
    Object.assign(service as any, {
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockResolvedValue([{ id: 7, login: 'alice', role: USER_ROLE.USER }])
        })
      },
      spacesQueries: { spacesQuotaPaths: vi.fn().mockResolvedValue([]) },
      sharesQueries: { sharesQuotaExternalPaths: vi.fn().mockResolvedValue([]) }
    })
    const discoverTemporaryUsersRoot = vi.spyOn(service as any, 'discoverTemporaryUsersRoot').mockResolvedValue(undefined)

    await service.cleanupUserTmpFiles()

    expect(discoverTemporaryUsersRoot).toHaveBeenCalledWith(
      path.join(UserModel.getHomePath('alice'), TEMPORARY_PATH.STORAGE, TEMPORARY_PATH.ACTORS),
      expect.any(Map)
    )
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

    await (service as any).cleanupTemporaryDirectories(7, [{ includeUnmanagedEntries: true, path: temporaryPath }], expiration)

    await expect(fs.readdir(temporaryPath).then((entries) => entries.sort())).resolves.toEqual(['recent.tmp', '~tmp-copy-active-report.txt'])
  })

  it('does not query tasks or remove legacy names from target temporary roots', async () => {
    const legacyPath = path.join(temporaryPath, 'legacy.tmp')
    await fs.writeFile(legacyPath, 'legacy')
    const expired = new Date(0)
    await fs.utimes(legacyPath, expired, expired)

    await (service as any).cleanupTemporaryDirectories(7, [{ includeUnmanagedEntries: false, path: temporaryPath }], Date.now())

    await expect(fs.readdir(temporaryPath)).resolves.toEqual(['legacy.tmp'])
    expect(cache.keys).not.toHaveBeenCalled()
  })

  it('keeps the managed actor namespace out of personal temporary cleanup', async () => {
    const actorRoot = path.join(temporaryPath, 'users', '42')
    const artifactPath = path.join(actorRoot, '~tmp-upload-session')
    await fs.mkdir(actorRoot, { recursive: true })
    await fs.writeFile(artifactPath, 'active')
    const expired = new Date(0)
    await Promise.all([fs.utimes(path.join(temporaryPath, 'users'), expired, expired), fs.utimes(actorRoot, expired, expired)])

    await (service as any).cleanupTemporaryDirectories(7, [{ includeUnmanagedEntries: true, path: temporaryPath }], Date.now())

    await expect(fs.readFile(artifactPath, 'utf8')).resolves.toBe('active')
    expect(cache.keys).not.toHaveBeenCalled()
  })

  it('protects shared-owner artifacts with the actor task cache', async () => {
    const actorRoot = path.join(temporaryPath, 'users', '42')
    const activePath = path.join(actorRoot, '~tmp-copy-active-report.txt')
    await fs.mkdir(actorRoot, { recursive: true })
    await fs.writeFile(activePath, 'active')
    await fs.utimes(activePath, new Date(0), new Date(0))
    cache.keys.mockResolvedValue(['ftask-42-active'])
    cache.mget.mockResolvedValue([{ id: 'active', type: FILE_OPERATION.COPY }])
    const temporaryDirectories = new Map()

    await (service as any).discoverTemporaryUsersRoot(path.join(temporaryPath, 'users'), temporaryDirectories)
    await (service as any).cleanupTemporaryDirectories(42, [...temporaryDirectories.get(42).values()], Date.now())

    await expect(fs.readFile(activePath, 'utf8')).resolves.toBe('active')
    expect(cache.keys).toHaveBeenCalledWith('ftask-42-*')
  })

  it('preserves an expired upload session while a recent operation owns its lock', async () => {
    const sessionPath = path.join(temporaryPath, '~tmp-upload-00000000-0000-4000-8000-000000000000-session')
    await fs.mkdir(sessionPath)
    await fs.writeFile(path.join(sessionPath, FILE_UPLOAD_SESSION.LOCK), '00000000-0000-4000-8000-000000000003')
    const expired = new Date(0)
    await fs.utimes(sessionPath, expired, expired)

    await (service as any).cleanupTemporaryDirectories(7, [{ includeUnmanagedEntries: false, path: temporaryPath }], Date.now() - 1_000)

    await expect(fs.stat(sessionPath)).resolves.toBeDefined()
  })

  it('cleans an expired upload session with an abandoned lock', async () => {
    const sessionPath = path.join(temporaryPath, '~tmp-upload-00000000-0000-4000-8000-000000000000-session')
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

    await (service as any).cleanupTemporaryDirectories(7, [{ includeUnmanagedEntries: false, path: temporaryPath }], Date.now() - 1_000)

    await expect(fs.stat(sessionPath)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(cache.keys).not.toHaveBeenCalled()
  })

  it('cleans a session past its absolute lifetime even when HEAD-like claim activity refreshed the directory', async () => {
    const sessionPath = path.join(temporaryPath, '~tmp-upload-00000000-0000-4000-8000-000000000000-session')
    await fs.mkdir(sessionPath)
    const manifestPath = path.join(sessionPath, FILE_UPLOAD_SESSION.MANIFEST)
    await fs.writeFile(manifestPath, '{}')
    await fs.writeFile(path.join(sessionPath, FILE_UPLOAD_SESSION.PAYLOAD), '')
    const expired = new Date(Date.now() - FILE_UPLOAD_SESSION_MAX_AGE_MS - 1_000)
    await fs.utimes(manifestPath, expired, expired)
    await fs.utimes(sessionPath, new Date(), new Date())

    await (service as any).cleanupTemporaryDirectories(7, [{ includeUnmanagedEntries: false, path: temporaryPath }], Date.now() - 86_400_000)

    await expect(fs.stat(sessionPath)).rejects.toMatchObject({ code: 'ENOENT' })
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
        { includeUnmanagedEntries: false, path: firstPath },
        { includeUnmanagedEntries: false, path: secondPath }
      ],
      expiration
    )

    await expect(fs.readdir(firstPath)).resolves.toEqual([])
    await expect(fs.readdir(secondPath)).resolves.toEqual(['~tmp-copy-concurrent-report.txt'])
    expect(cache.keys).toHaveBeenCalledOnce()
  })
})
