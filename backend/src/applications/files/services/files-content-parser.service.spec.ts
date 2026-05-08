import { Test, TestingModule } from '@nestjs/testing'
import path from 'node:path'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants'
import { SPACE_ALIAS, SPACE_REPOSITORY } from '../../spaces/constants/spaces'
import { SpaceModel } from '../../spaces/models/space.model'
import { UserModel } from '../../users/models/user.model'
import { FILE_REPOSITORY } from '../constants/operations'
import * as filesUtils from '../utils/files'
import { FilesContentParser } from './files-content-parser.service'

interface QueryMock {
  from: jest.Mock
  leftJoin: jest.Mock
  where: jest.Mock
  groupBy: jest.Mock
}

describe(FilesContentParser.name, () => {
  let service: FilesContentParser
  let db: { select: jest.Mock }
  let isPathExistsSpy: jest.SpiedFunction<typeof filesUtils.isPathExists>

  const mockQuery = (rows: unknown[], options: { groupBy?: boolean } = {}): QueryMock => {
    const query = {} as QueryMock
    query.from = jest.fn(() => query)
    query.leftJoin = jest.fn(() => query)
    query.where = jest.fn(() => (options.groupBy ? query : rows))
    query.groupBy = jest.fn(() => rows)
    db.select.mockReturnValueOnce(query)
    return query
  }

  beforeEach(async () => {
    db = { select: jest.fn() }
    const module: TestingModule = await Test.createTestingModule({
      providers: [FilesContentParser, { provide: DB_TOKEN_PROVIDER, useValue: db }]
    }).compile()

    module.useLogger(['fatal'])
    service = module.get<FilesContentParser>(FilesContentParser)
    isPathExistsSpy = jest.spyOn(filesUtils, 'isPathExists').mockResolvedValue(true)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  it('should return all repository paths when no filter is provided', async () => {
    const userPaths = [{ id: 1, type: FILE_REPOSITORY.USER, paths: [{ realPath: '/users/john/files', pathPrefix: 'files/personal', isDir: true }] }]
    const spacePaths = [
      { id: 2, type: FILE_REPOSITORY.SPACE, paths: [{ realPath: '/spaces/project/files', pathPrefix: 'files/project', isDir: true }] }
    ]
    const sharePaths = [{ id: 3, type: FILE_REPOSITORY.SHARE, paths: [{ realPath: '/shares/docs', pathPrefix: 'shares/docs', isDir: true }] }]
    const userPathsSpy = jest.spyOn(service as any, 'userPaths').mockResolvedValue(userPaths)
    const spacePathsSpy = jest.spyOn(service as any, 'spacePaths').mockResolvedValue(spacePaths)
    const sharePathsSpy = jest.spyOn(service as any, 'sharePaths').mockResolvedValue(sharePaths as any)

    await expect(service.allPaths()).resolves.toEqual([...userPaths, ...spacePaths, ...sharePaths])
    expect(userPathsSpy).toHaveBeenCalledWith(undefined)
    expect(spacePathsSpy).toHaveBeenCalledWith(undefined)
    expect(sharePathsSpy).toHaveBeenCalledWith(undefined)
  })

  it('should only query filtered repositories and ignore empty filters', async () => {
    const userPaths = [{ id: 1, type: FILE_REPOSITORY.USER, paths: [{ realPath: '/users/john/files', pathPrefix: 'files/personal', isDir: true }] }]
    const userPathsSpy = jest.spyOn(service as any, 'userPaths').mockResolvedValue(userPaths)
    const spacePathsSpy = jest.spyOn(service as any, 'spacePaths').mockResolvedValue([])
    const sharePathsSpy = jest.spyOn(service as any, 'sharePaths').mockResolvedValue([])

    await expect(service.allPaths([1], [], [])).resolves.toEqual(userPaths)
    expect(userPathsSpy).toHaveBeenCalledWith([1])
    expect(spacePathsSpy).not.toHaveBeenCalled()
    expect(sharePathsSpy).not.toHaveBeenCalled()
  })

  it('should return an empty list without querying when every filter is empty', async () => {
    await expect(service.allPaths([], [], [])).resolves.toEqual([])
    expect(db.select).not.toHaveBeenCalled()
  })

  it('should build user file paths and skip missing user repositories', async () => {
    mockQuery([
      { id: 1, login: 'john' },
      { id: 2, login: 'jane' }
    ])
    isPathExistsSpy.mockImplementation(async (p: string) => p === UserModel.getFilesPath('john'))

    await expect((service as any).userPaths([1, 2])).resolves.toEqual([
      {
        id: 1,
        type: FILE_REPOSITORY.USER,
        paths: [
          {
            realPath: UserModel.getFilesPath('john'),
            pathPrefix: `${SPACE_REPOSITORY.FILES}/${SPACE_ALIAS.PERSONAL}`,
            isDir: true
          }
        ]
      }
    ])
    expect(db.select).toHaveBeenCalledTimes(1)
    expect(isPathExistsSpy).toHaveBeenCalledWith(UserModel.getFilesPath('john'))
    expect(isPathExistsSpy).toHaveBeenCalledWith(UserModel.getFilesPath('jane'))
  })

  it('should not query users when user filter is empty', async () => {
    await expect((service as any).userPaths([])).resolves.toEqual([])
    expect(db.select).not.toHaveBeenCalled()
  })

  it('should build space file paths with internal and external roots', async () => {
    mockQuery(
      [
        {
          id: 7,
          alias: 'project',
          roots: [
            { alias: 'external-docs', externalPath: '/mnt/docs', isDir: true },
            { alias: 'owner-file', externalPath: null, isDir: false, file: { fromOwner: 'john', path: 'reports/a.txt' } }
          ]
        }
      ],
      { groupBy: true }
    )

    await expect((service as any).spacePaths([7])).resolves.toEqual([
      {
        id: 7,
        type: FILE_REPOSITORY.SPACE,
        paths: [
          {
            realPath: SpaceModel.getFilesPath('project'),
            pathPrefix: `${SPACE_REPOSITORY.FILES}/project`,
            isDir: true
          },
          {
            realPath: '/mnt/docs',
            pathPrefix: `${SPACE_REPOSITORY.FILES}/project/external-docs`,
            isDir: true
          },
          {
            realPath: path.join(UserModel.getFilesPath('john'), 'reports/a.txt'),
            pathPrefix: `${SPACE_REPOSITORY.FILES}/project/owner-file`,
            isDir: false
          }
        ]
      }
    ])
    expect(db.select).toHaveBeenCalledTimes(1)
    expect(isPathExistsSpy).toHaveBeenCalledWith(SpaceModel.getFilesPath('project'))
  })

  it('should not query spaces when space filter is empty', async () => {
    await expect((service as any).spacePaths([])).resolves.toEqual([])
    expect(db.select).not.toHaveBeenCalled()
  })

  it('should build share file paths from external, user, and space sources', async () => {
    mockQuery(
      [
        { id: 10, alias: 'external-share', externalPath: '/mnt/share', isDir: true, file: { path: 'docs', fromOwner: null, fromSpace: null } },
        { id: 11, alias: 'user-share', externalPath: null, isDir: false, file: { path: 'notes/a.txt', fromOwner: 'john', fromSpace: null } },
        { id: 12, alias: 'space-share', externalPath: null, isDir: true, file: { path: 'folder', fromOwner: null, fromSpace: 'project' } },
        { id: 13, alias: 'orphan-share', externalPath: null, isDir: true, file: { path: '.', fromOwner: null, fromSpace: null } },
        { id: 14, alias: 'missing-share', externalPath: '/missing', isDir: true, file: { path: 'docs', fromOwner: null, fromSpace: null } }
      ],
      { groupBy: true }
    )
    isPathExistsSpy.mockImplementation(async (p: string) => p !== path.join('/missing', 'docs'))

    await expect((service as any).sharePaths([10, 11, 12, 13, 14])).resolves.toEqual([
      {
        id: 10,
        type: FILE_REPOSITORY.SHARE,
        paths: [{ realPath: path.join('/mnt/share', 'docs'), pathPrefix: `${SPACE_REPOSITORY.SHARES}/external-share`, isDir: true }]
      },
      {
        id: 11,
        type: FILE_REPOSITORY.SHARE,
        paths: [
          { realPath: path.join(UserModel.getFilesPath('john'), 'notes/a.txt'), pathPrefix: `${SPACE_REPOSITORY.SHARES}/user-share`, isDir: false }
        ]
      },
      {
        id: 12,
        type: FILE_REPOSITORY.SHARE,
        paths: [
          { realPath: path.join(SpaceModel.getFilesPath('project'), 'folder'), pathPrefix: `${SPACE_REPOSITORY.SHARES}/space-share`, isDir: true }
        ]
      }
    ])
    expect(db.select).toHaveBeenCalledTimes(1)
    expect(isPathExistsSpy).toHaveBeenCalledWith(path.join('/missing', 'docs'))
  })

  it('should not query shares when share filter is empty', async () => {
    await expect((service as any).sharePaths([])).resolves.toEqual([])
    expect(db.select).not.toHaveBeenCalled()
  })
})
