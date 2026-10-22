import { HttpException, HttpStatus } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configuration } from '../../../configuration/config.environment.js'
import { Cache } from '../../../infrastructure/cache/cache.service.js'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants.js'
import { FilesConfig } from '../../files/files.config.js'
import { FileError } from '../../files/models/file-error.js'
import { FilesQueries } from '../../files/services/files-queries.service.js'
import { removeFiles } from '../../files/utils/files.js'
import { LinksQueries } from '../../links/services/links-queries.service.js'
import { NotificationsManager } from '../../notifications/services/notifications-manager.service.js'
import { SharesManager } from '../../shares/services/shares-manager.service.js'
import { SharesQueries } from '../../shares/services/shares-queries.service.js'
import { MEMBER_TYPE } from '../../users/constants/member.js'
import { UserModel } from '../../users/models/user.model.js'
import { UsersQueries } from '../../users/services/users-queries.service.js'
import { generateUserTest } from '../../users/utils/test.js'
import { SPACE_ALIAS, SPACE_ALL_OPERATIONS, SPACE_OPERATION, SPACE_PERMS_SEP, SPACE_REPOSITORY } from '../constants/spaces.js'
import { createOrUpdateSpaceSchema, spaceMemberSchema } from '../dto/create-or-update-space.dto.js'
import { spaceRootFileSchema } from '../dto/space-roots.dto.js'
import { SpaceEnv } from '../models/space-env.model.js'
import { SpaceModel } from '../models/space.model.js'
import { IsRealPathIsDirAndExists } from '../utils/paths.js'
import { SpacesManager } from './spaces-manager.service.js'
import { SpacesQueries } from './spaces-queries.service.js'
import { FilesQuotaManager } from '../../files/services/files-quota-manager.service.js'

describe(SpacesManager.name, () => {
  let filesConfig: FilesConfig
  let spacesManager: SpacesManager
  let spacesQueries: SpacesQueries
  let userTest: UserModel
  const spaceAlias = 'project'
  const tmpDir = os.tmpdir()

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: DB_TOKEN_PROVIDER, useValue: {} },
        {
          provide: Cache,
          useValue: { get: () => null }
        },
        {
          provide: NotificationsManager,
          useValue: {}
        },
        {
          provide: FilesQuotaManager,
          useValue: { setQuotaExceeded: () => vi.fn() }
        },
        SpacesManager,
        SpacesQueries,
        UsersQueries,
        SharesManager,
        SharesQueries,
        FilesQueries,
        LinksQueries
      ]
    }).compile()

    module.useLogger(['fatal'])
    filesConfig = configuration.applications.files
    spacesManager = module.get<SpacesManager>(SpacesManager)
    spacesQueries = module.get<SpacesQueries>(SpacesQueries)
    userTest = new UserModel(generateUserTest())
  })

  afterAll(async () => {
    await removeFiles(userTest.homePath)
    await removeFiles(SpaceModel.getHomePath(spaceAlias))
  })

  it('should be defined', () => {
    expect(filesConfig).toBeDefined()
    expect(spacesManager).toBeDefined()
    expect(userTest).toBeDefined()
  })

  it('should prevent path traversal', () => {
    const createOrUpdateSpaceDto = createOrUpdateSpaceSchema.parse({
      name: '../../../foo/..bar',
      alias: '../../bar.',
      managers: [spaceMemberSchema.parse({ id: 0, type: MEMBER_TYPE.USER })]
    })
    expect(createOrUpdateSpaceDto.name).toEqual('foobar')
    expect(createOrUpdateSpaceDto.alias).toEqual('bar')
    const spaceRootFileDto = spaceRootFileSchema.parse({ id: 0, path: '../../foo/bar' })
    expect(spaceRootFileDto.path).toEqual('foo/bar')
    const spaceRootFileDto2 = spaceRootFileSchema.parse({
      id: 0,
      path: `${SPACE_REPOSITORY.FILES}/${SPACE_ALIAS.PERSONAL}/../../../foo/bar`
    })
    expect(spaceRootFileDto2.path).toEqual('foo/bar')
  })

  it('should validate the permissions on personal & shares space', async () => {
    const personalSpace = (await spacesManager.spaceEnv(userTest, ['files', SPACE_ALIAS.PERSONAL]))!
    expect(personalSpace.envPermissions).toBe(
      Object.values(SPACE_OPERATION)
        .filter((p) => p !== SPACE_OPERATION.DELETE)
        .join(SPACE_PERMS_SEP)
    )
    const personalTrash = (await spacesManager.spaceEnv(userTest, ['trash', SPACE_ALIAS.PERSONAL]))!
    expect(personalTrash.envPermissions).toBe(SPACE_ALL_OPERATIONS)
    const sharesSpace = (await spacesManager.spaceEnv(userTest, ['shares']))!
    expect(sharesSpace.envPermissions).toBe('')
  })

  it('should count only browsable trash entries', async () => {
    vi.spyOn(spacesManager, 'listSpaces').mockResolvedValueOnce([])
    await fs.mkdir(userTest.trashPath, { recursive: true })

    try {
      await fs.writeFile(path.join(userTest.trashPath, 'visible.txt'), '')
      await fs.writeFile(path.join(userTest.trashPath, '.hidden'), '')
      await fs.symlink('visible.txt', path.join(userTest.trashPath, 'file-link'))
      const trashes = await spacesManager.listTrashes(userTest)

      expect(trashes).toHaveLength(1)
      expect(trashes[0]).toMatchObject({ alias: SPACE_ALIAS.PERSONAL, nb: 2 })
    } finally {
      await removeFiles(userTest.trashPath)
    }
  })

  it("should validate (or not) the user's personal space (files & trash repositories)", async () => {
    for (const repository of [SPACE_REPOSITORY.FILES, SPACE_REPOSITORY.TRASH]) {
      const spaceEnv = (await spacesManager.spaceEnv(userTest, [repository, SPACE_ALIAS.PERSONAL, 'foo', 'bar']))!
      expect(spaceEnv.envPermissions).toBe(SPACE_ALL_OPERATIONS)
      await expect(IsRealPathIsDirAndExists(spaceEnv.realPath)).rejects.toThrow()
      const repoPath = UserModel.getRepositoryPath(userTest.login, spaceEnv.inTrashRepository)
      await fs.mkdir(path.join(repoPath, 'foo', 'bar'), { recursive: true })
      await expect(IsRealPathIsDirAndExists(spaceEnv.realPath)).resolves.toBeUndefined()
      await removeFiles(path.join(repoPath, 'foo', 'bar'))
      try {
        await IsRealPathIsDirAndExists(spaceEnv.realPath)
      } catch (e) {
        expect(e).toBeInstanceOf(FileError)
      }
    }
  })

  it(`should validate (or not) the space : ${spaceAlias} (files & trash repositories)`, async () => {
    const permissions: Partial<SpaceEnv> = {
      id: 1,
      alias: spaceAlias,
      name: spaceAlias,
      enabled: true,
      permissions: 'a:d:m:so',
      role: 0
    }
    spacesQueries.permissions = vi.fn().mockReturnValue(permissions)
    for (const repository of [SPACE_REPOSITORY.FILES, SPACE_REPOSITORY.TRASH]) {
      const spaceEnv = (await spacesManager.spaceEnv(userTest, [repository, spaceAlias, 'foo', 'bar']))!
      await expect(IsRealPathIsDirAndExists(spaceEnv.realPath)).rejects.toThrow()
      const repoPath = SpaceModel.getRepositoryPath(spaceAlias, spaceEnv.inTrashRepository)
      await fs.mkdir(path.join(repoPath, spaceEnv.root!.alias, ...spaceEnv.paths), { recursive: true })
      await expect(IsRealPathIsDirAndExists(spaceEnv.realPath)).resolves.toBeUndefined()
      await removeFiles(path.join(repoPath, spaceEnv.root!.alias, ...spaceEnv.paths))
    }
  })

  it(`should validate (or not) the space : ${spaceAlias} with a root (an external dir)`, async () => {
    const permissions: Partial<SpaceEnv> = {
      id: 0,
      alias: spaceAlias,
      name: spaceAlias,
      permissions: SPACE_ALL_OPERATIONS,
      root: { id: 1, alias: 'foo', name: 'foo', externalPath: tmpDir, permissions: SPACE_ALL_OPERATIONS }
    }
    spacesQueries.permissions = vi.fn().mockReturnValueOnce(permissions)
    const spaceEnv = (await spacesManager.spaceEnv(userTest, [SPACE_REPOSITORY.FILES, spaceAlias, 'foo', 'bar']))!
    const rootPath = path.join(tmpDir, ...spaceEnv.paths)
    await fs.mkdir(rootPath, { recursive: true })
    await expect(IsRealPathIsDirAndExists(spaceEnv.realPath)).resolves.toBeUndefined()
    await removeFiles(rootPath)
    await expect(IsRealPathIsDirAndExists(spaceEnv.realPath)).rejects.toThrow()
  })

  it(`should validate (or not) the space : ${spaceAlias} with a root (a file/directory from user)`, async () => {
    const permissions: Partial<SpaceEnv> = {
      id: 0,
      alias: spaceAlias,
      name: spaceAlias,
      permissions: SPACE_ALL_OPERATIONS,
      root: {
        id: 1,
        alias: 'document',
        name: 'document',
        file: { id: 0, path: '/foo', inTrash: false },
        owner: { id: 0, login: userTest.login },
        permissions: SPACE_ALL_OPERATIONS
      }
    }
    spacesQueries.permissions = vi.fn().mockReturnValueOnce(permissions)
    const spaceEnv = (await spacesManager.spaceEnv(userTest, [SPACE_REPOSITORY.FILES, spaceAlias, 'document', 'bar']))!
    await fs.mkdir(path.join(UserModel.getFilesPath(userTest.login), 'foo', 'bar'), { recursive: true })
    await expect(IsRealPathIsDirAndExists(spaceEnv.realPath)).resolves.toBeUndefined()
    await removeFiles(path.join(UserModel.getFilesPath(userTest.login), 'foo', 'bar'))
    await expect(IsRealPathIsDirAndExists(spaceEnv.realPath)).rejects.toThrow()
    delete (spaceEnv.root!.file as { path?: string }).path
    try {
      await IsRealPathIsDirAndExists(spaceEnv.realPath)
    } catch (e) {
      expect(e).toBeInstanceOf(FileError)
    }
  })

  it('should list spaces as admin using spacesAsAdmin query', async () => {
    const spaces = [{ id: 1, alias: 's1' }]
    const spy = vi.spyOn(spacesQueries, 'spacesAsAdmin').mockResolvedValueOnce(spaces as any)

    const result = await spacesManager.listSpacesAsAdmin()

    expect(spy).toHaveBeenCalled()
    expect(result).toBe(spaces)
  })

  it('should get a space with admin-or-manager access check', async () => {
    const admin = { id: 99, isAdmin: true } as UserModel
    const space = { id: 5, alias: 'space-5', roots: [] }
    const spy = vi.spyOn(spacesQueries, 'getSpaceAsAdminOrManager').mockResolvedValueOnce(space as any)

    const result = await spacesManager.getSpace(admin, 5)

    expect(spy).toHaveBeenCalledWith(admin, 5)
    expect(result).toBe(space)
  })

  it('should throw Forbidden when user is neither admin nor manager for space shares', async () => {
    vi.spyOn(spacesQueries, 'userIsAdminOrSpaceManager').mockResolvedValueOnce(false)

    await expect(spacesManager.listSpaceShares(userTest, 10)).rejects.toEqual(new HttpException('Unauthorized', HttpStatus.FORBIDDEN))
  })

  describe('alias generation', () => {
    const currentSpaceId = 42
    const currentRootId = 24
    const name = 'Lébà est chez moi'
    const alias = 'leba-est-chez-moi'
    const uniqueSpaceAlias = (value: string): Promise<string> => (spacesManager as any).uniqueSpaceAlias(value, currentSpaceId)

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should normalize the renamed space name and numeric suffix before checking availability', async () => {
      const spaceExistsSpy = vi.spyOn(spacesQueries, 'spaceExistsForAlias').mockResolvedValueOnce(undefined)

      await expect(uniqueSpaceAlias(`${name}-2`)).resolves.toBe(alias)
      expect(spaceExistsSpy).toHaveBeenCalledWith(alias, currentSpaceId)
      spaceExistsSpy.mockRestore()
    })

    it('should accept a space alias of exactly 255 UTF-8 bytes', async () => {
      vi.spyOn(spacesQueries, 'spaceExistsForAlias').mockResolvedValueOnce(undefined)
      const name = '漢'.repeat(85)

      await expect(uniqueSpaceAlias(name)).resolves.toBe(name)
    })

    it.each([
      ['漢'.repeat(86), '漢'.repeat(85)],
      ['가'.repeat(86), '\u1100\u1161'.repeat(42)],
      ['a'.repeat(256), 'a'.repeat(255)]
    ])('should truncate an oversized space alias without splitting graphemes', async (name, expectedAlias) => {
      const spaceExistsSpy = vi.spyOn(spacesQueries, 'spaceExistsForAlias').mockResolvedValueOnce(undefined)

      await expect(uniqueSpaceAlias(name)).resolves.toBe(expectedAlias)
      expect(spaceExistsSpy).toHaveBeenCalledExactlyOnceWith(expectedAlias, currentSpaceId)
    })

    it('should resolve collisions using truncated aliases with suffixes inside the byte limit', async () => {
      const spaceExistsSpy = vi
        .spyOn(spacesQueries, 'spaceExistsForAlias')
        .mockResolvedValueOnce({ id: 1 })
        .mockResolvedValueOnce({ id: 2 })
        .mockResolvedValueOnce(undefined)
      const name = '漢'.repeat(85)

      await expect(uniqueSpaceAlias(name)).resolves.toBe(`${'漢'.repeat(84)}-2`)
      expect(spaceExistsSpy.mock.calls).toEqual([
        [name, currentSpaceId],
        [`${'漢'.repeat(84)}-1`, currentSpaceId],
        [`${'漢'.repeat(84)}-2`, currentSpaceId]
      ])
    })

    it('should reserve additional suffix bytes when collisions reach two digits', async () => {
      const spaceExistsSpy = vi.spyOn(spacesQueries, 'spaceExistsForAlias').mockResolvedValue(undefined)
      for (let count = 0; count < 10; count += 1) {
        spaceExistsSpy.mockResolvedValueOnce({ id: 1 })
      }

      await expect(uniqueSpaceAlias('a'.repeat(255))).resolves.toBe(`${'a'.repeat(252)}-10`)
      expect(spaceExistsSpy).toHaveBeenCalledTimes(11)
      expect(spaceExistsSpy).toHaveBeenNthCalledWith(10, `${'a'.repeat(253)}-9`, currentSpaceId)
      expect(spaceExistsSpy).toHaveBeenNthCalledWith(11, `${'a'.repeat(252)}-10`, currentSpaceId)
      for (const [alias] of spaceExistsSpy.mock.calls) {
        expect(Buffer.byteLength(alias, 'utf8')).toBeLessThanOrEqual(255)
      }
    })

    it('should resolve collisions when a single grapheme exceeds the byte limit', async () => {
      const spaceExistsSpy = vi.spyOn(spacesQueries, 'spaceExistsForAlias').mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce(undefined)

      await expect(uniqueSpaceAlias('\u1100'.repeat(86))).resolves.toBe('space-1')
      expect(spaceExistsSpy.mock.calls).toEqual([
        ['space', currentSpaceId],
        ['space-1', currentSpaceId]
      ])
    })

    it('should ignore symbols when allocating the space alias byte budget', async () => {
      const spaceExistsSpy = vi.spyOn(spacesQueries, 'spaceExistsForAlias').mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce(undefined)

      await expect(uniqueSpaceAlias(`${'📷'.repeat(64)}a`)).resolves.toBe('a-1')
      expect(spaceExistsSpy.mock.calls).toEqual([
        ['a', currentSpaceId],
        ['a-1', currentSpaceId]
      ])
    })

    it('should exclude the current root when checking its alias', async () => {
      const rootExistsSpy = vi.spyOn(spacesQueries, 'spaceRootExistsForAlias').mockResolvedValueOnce(undefined)

      await expect(spacesManager.uniqueRootAlias(1, alias, [], true, currentRootId)).resolves.toBeNull()
      expect(rootExistsSpy).toHaveBeenCalledWith(1, alias, currentRootId)
      rootExistsSpy.mockRestore()
    })

    it('should remove accents while normalizing case, numeric suffix and extension, excluding the current root', async () => {
      const rootExistsSpy = vi.spyOn(spacesQueries, 'spaceRootExistsForAlias').mockResolvedValue(undefined)

      await expect(spacesManager.uniqueRootAlias(currentSpaceId, 'Rapport E\u0301TE\u0301-2.PDF', [], true, currentRootId, true)).resolves.toBe(
        'rapport-ete.pdf'
      )
      expect(rootExistsSpy).toHaveBeenCalledExactlyOnceWith(currentSpaceId, 'rapport-ete.pdf', currentRootId)
    })

    it('should bound a normalized root alias to 255 characters', async () => {
      const rootExistsSpy = vi.spyOn(spacesQueries, 'spaceRootExistsForAlias').mockResolvedValue(undefined)
      const expectedAlias = 'a'.repeat(255)

      await expect(spacesManager.uniqueRootAlias(currentSpaceId, 'a'.repeat(256), [], true, currentRootId, true)).resolves.toBe(expectedAlias)
      expect(rootExistsSpy).toHaveBeenCalledExactlyOnceWith(currentSpaceId, expectedAlias, currentRootId)
    })

    it.each([
      ['rapport.---', 'rapport'],
      ['---.pdf', 'pdf']
    ])('should normalize the whole root alias %s when its name or extension cannot form a slug', async (requestedAlias, normalizedAlias) => {
      const rootExistsSpy = vi.spyOn(spacesQueries, 'spaceRootExistsForAlias').mockResolvedValue(undefined)

      await expect(spacesManager.uniqueRootAlias(currentSpaceId, requestedAlias, [], true, undefined, true)).resolves.toBe(normalizedAlias)
      expect(rootExistsSpy).toHaveBeenCalledExactlyOnceWith(currentSpaceId, normalizedAlias, undefined)
    })

    it('should remove accents before resolving database collisions with a suffix before the extension', async () => {
      const rootExistsSpy = vi.spyOn(spacesQueries, 'spaceRootExistsForAlias').mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce(undefined)
      const aliasesAndNames = ['Rapport été.PDF', 'rapport-été.pdf']

      await expect(spacesManager.uniqueRootAlias(currentSpaceId, 'Rapport été-2.PDF', aliasesAndNames, true, currentRootId, true)).resolves.toBe(
        'rapport-ete-1.pdf'
      )
      expect(rootExistsSpy.mock.calls).toEqual([
        [currentSpaceId, 'rapport-ete.pdf', currentRootId],
        [currentSpaceId, 'rapport-ete-1.pdf', currentRootId]
      ])
      expect(aliasesAndNames).toEqual(['Rapport été.PDF', 'rapport-été.pdf'])
    })

    it.each([
      ['가.pdf', '\u1100\u1161.PDF', '\u1100\u1161-1.pdf'],
      ['\u1100\u1161.pdf', '가.PDF', '\u1100\u1161-1.pdf']
    ])('should avoid equivalent file names after normalizing %s', async (requestedAlias, fileName, expectedAlias) => {
      const rootExistsSpy = vi.spyOn(spacesQueries, 'spaceRootExistsForAlias').mockResolvedValue(undefined)

      await expect(spacesManager.uniqueRootAlias(currentSpaceId, requestedAlias, [fileName], true, currentRootId, true)).resolves.toBe(expectedAlias)
      expect(rootExistsSpy).toHaveBeenCalledExactlyOnceWith(currentSpaceId, expectedAlias, currentRootId)
    })

    it.each([
      ['café.pdf', 'CAFE\u0301.PDF', 'cafe-1.pdf'],
      ['cafe\u0301.pdf', 'CAFÉ.PDF', 'cafe-1.pdf']
    ])('should resolve canonically equivalent file-name collisions when browsing %s', async (requestedAlias, fileName, expectedAlias) => {
      const rootExistsSpy = vi.spyOn(spacesQueries, 'spaceRootExistsForAlias').mockResolvedValue(undefined)

      await expect(spacesManager.uniqueRootAlias(currentSpaceId, requestedAlias, [fileName], true, currentRootId)).resolves.toBe(expectedAlias)
      expect(rootExistsSpy).toHaveBeenCalledExactlyOnceWith(currentSpaceId, expectedAlias, currentRootId)
    })

    it('should reject root aliases without any letters or numbers before querying the database', async () => {
      const rootExistsSpy = vi.spyOn(spacesQueries, 'spaceRootExistsForAlias').mockResolvedValue(undefined)

      await expect(spacesManager.uniqueRootAlias(currentSpaceId, '---', [], true, undefined, true)).rejects.toEqual(
        new HttpException('Name must contain at least one letter or number', HttpStatus.BAD_REQUEST)
      )
      expect(rootExistsSpy).not.toHaveBeenCalled()
    })

    it.each(['Rapport été-2.PDF', 'cafe\u0301.pdf'])('should preserve the available Unicode alias %s when browsing', async (alias) => {
      const rootExistsSpy = vi.spyOn(spacesQueries, 'spaceRootExistsForAlias').mockResolvedValue(undefined)

      await expect(spacesManager.uniqueRootAlias(currentSpaceId, alias, [], true)).resolves.toBeNull()
      expect(rootExistsSpy).toHaveBeenCalledExactlyOnceWith(currentSpaceId, alias, undefined)
    })

    it('should keep compatibility-equivalent file names distinct when browsing a legacy alias', async () => {
      const rootExistsSpy = vi.spyOn(spacesQueries, 'spaceRootExistsForAlias').mockResolvedValue(undefined)

      await expect(spacesManager.uniqueRootAlias(currentSpaceId, 'ﬃ.pdf', ['ffi.pdf'], true)).resolves.toBeNull()
      expect(rootExistsSpy).toHaveBeenCalledExactlyOnceWith(currentSpaceId, 'ﬃ.pdf', undefined)
    })
  })
})
