import * as filesUtils from '../../files/utils/files.js'
import type { UserModel } from '../../users/models/user.model.js'
import { SPACE_ALIAS, SPACE_ALL_OPERATIONS, SPACE_OPERATION, SPACE_REPOSITORY, SPACE_ROLE } from '../constants/spaces.js'
import { SpaceEnv } from './space-env.model.js'

describe(SpaceEnv.name, () => {
  const user = { id: 7, login: 'john' } as UserModel

  function createSpace(props: Partial<SpaceEnv> = {}, rootAlias: string | null = '', mustHaveRoot = true): SpaceEnv {
    return new SpaceEnv(
      {
        id: 1,
        alias: 'project',
        name: 'Project',
        enabled: true,
        permissions: `${SPACE_OPERATION.ADD}:${SPACE_OPERATION.DELETE}:${SPACE_OPERATION.MODIFY}`,
        role: SPACE_ROLE.IS_MEMBER,
        storageUsage: 0,
        storageQuota: null,
        ...props
      },
      rootAlias,
      mustHaveRoot
    )
  }

  afterEach(() => vi.restoreAllMocks())

  describe('constructor', () => {
    it('should compute whether the quota is already exceeded', () => {
      expect(createSpace({ storageUsage: 10, storageQuota: 10 }).quotaIsExceeded).toBe(true)
      expect(createSpace({ storageUsage: 9, storageQuota: 10 }).quotaIsExceeded).toBe(false)
      expect(createSpace({ storageUsage: 10, storageQuota: null }).quotaIsExceeded).toBe(false)
    })
  })

  describe('setup', () => {
    it('should initialize the target URLs', () => {
      const space = createSpace({}, 'documents')

      space.setup(
        user,
        SPACE_REPOSITORY.FILES,
        'documents',
        ['folder', 'report.docx'],
        [SPACE_REPOSITORY.FILES, 'project', 'documents', 'folder', 'report.docx']
      )

      expect(space.url).toBe('files/project/documents/folder/report.docx')
      expect(space.relativeUrl).toBe('documents/folder/report.docx')
    })

    it('should initialize the shares list without a real path', () => {
      const space = createSpace({ id: 0, alias: SPACE_ALIAS.SHARES, name: 'Shares', permissions: '' }, null, false)

      space.setup(user, SPACE_REPOSITORY.SHARES, null, [], [SPACE_REPOSITORY.SHARES])

      expect(space.url).toBe(SPACE_REPOSITORY.SHARES)
      expect(space.relativeUrl).toBe('.')
      expect(space.realPath).toBeUndefined()
    })
  })

  describe('permissions', () => {
    it('should preserve deletion when endpoint protection is skipped', () => {
      const space = createSpace({ permissions: 'm:a:d:a', inFilesRepository: true, paths: [] })

      space.setPermissions(true)

      expect(space.permissions).toBe('a:d:m')
      expect(space.root?.permissions).toBe('a:d:m')
      expect(space.envPermissions).toBe('a:d:m')
    })

    it('should derive permissions used while browsing', () => {
      const personalSpace = createSpace({ alias: SPACE_ALIAS.PERSONAL, permissions: SPACE_ALL_OPERATIONS, inPersonalSpace: true })
      const rootedSpace = createSpace({
        permissions: 'a:d:m',
        root: { id: 2, alias: 'documents', name: 'Documents', permissions: 'd:m:so' }
      })

      expect(personalSpace.browsePermissions()).toBe(
        SPACE_ALL_OPERATIONS.split(':')
          .filter((permission) => permission !== SPACE_OPERATION.SHARE_INSIDE)
          .join(':')
      )
      expect(rootedSpace.browsePermissions()).toBe('d:m')
    })
  })

  describe('quota', () => {
    it('should only reject content larger than the remaining quota', () => {
      const limitedSpace = createSpace({ storageUsage: 8, storageQuota: 10 })

      expect(limitedSpace.willExceedQuota(2)).toBe(false)
      expect(limitedSpace.willExceedQuota(3)).toBe(true)
      expect(createSpace({ storageUsage: 8, storageQuota: null }).willExceedQuota(Number.MAX_SAFE_INTEGER)).toBe(false)
    })
  })

  describe('getFileProps', () => {
    it('should return file metadata using the resolved database path', async () => {
      const space = createSpace(
        {
          realPath: '/storage/documents/report.docx',
          dbFile: { path: 'documents/report.docx', inTrash: false }
        },
        null,
        false
      )
      const props = {
        id: -10,
        path: 'documents',
        name: 'report.docx',
        isDir: false,
        size: 4,
        ctime: 1,
        mtime: 2,
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      }
      const getPropsSpy = vi.spyOn(filesUtils, 'getProps').mockResolvedValueOnce(props)

      await expect(space.getFileProps()).resolves.toBe(props)

      expect(getPropsSpy).toHaveBeenCalledWith(space.realPath, space.dbFile.path)
    })
  })
})
