import { HttpException, HttpStatus } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import path from 'node:path'
import type { Mock } from 'vitest'
import { transformAndValidate } from '../../../common/functions'
import { Cache } from '../../../infrastructure/cache/cache.service'
import { ContextManager } from '../../../infrastructure/context/services/context-manager.service'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants'
import { NotificationsManager } from '../../notifications/services/notifications-manager.service'
import { SharesManager } from '../../shares/services/shares-manager.service'
import { SPACE_REPOSITORY } from '../../spaces/constants/spaces'
import { SpaceEnv } from '../../spaces/models/space-env.model'
import { SpaceModel } from '../../spaces/models/space.model'
import { SpacesManager } from '../../spaces/services/spaces-manager.service'
import { SpacesQueries } from '../../spaces/services/spaces-queries.service'
import { UserModel } from '../../users/models/user.model'
import { UsersQueries } from '../../users/services/users-queries.service'
import { generateUserTest } from '../../users/utils/test'
import { TAR_EXTENSION } from '../constants/compress'
import { CompressFileDto, CopyMoveFileDto } from '../dto/file-operations.dto'
import { FilesManager } from './files-manager.service'
import { FilesMethods } from './files-methods.service'
import { FilesQuotaManager } from './files-quota-manager.service'

describe(FilesMethods.name, () => {
  let filesMethods: FilesMethods
  let spacesManager: SpacesManager
  let filesQuotaManager: FilesQuotaManager
  let filesManager: { compress: Mock; delete: Mock }
  let userTest: UserModel
  const spaceEnv = {
    id: 1,
    alias: 'project',
    name: 'project',
    enabled: true,
    permissions: 'a:d:m:so',
    role: 0,
    realBasePath: SpaceModel.getFilesPath('project'),
    realPath: path.join(SpaceModel.getFilesPath('project'), 'foo'),
    url: `${SPACE_REPOSITORY.FILES}/project/foo`
  } as SpaceEnv

  beforeAll(async () => {
    filesManager = {
      compress: vi.fn(),
      delete: vi.fn()
    }
    const module: TestingModule = await Test.createTestingModule({
      imports: [],
      providers: [
        FilesMethods,
        SpacesManager,
        { provide: DB_TOKEN_PROVIDER, useValue: {} },
        {
          provide: Cache,
          useValue: { get: () => null }
        },
        { provide: ContextManager, useValue: {} },
        {
          provide: NotificationsManager,
          useValue: {}
        },
        { provide: UsersQueries, useValue: {} },
        { provide: SharesManager, useValue: {} },
        { provide: FilesQuotaManager, useValue: {} },
        {
          provide: SpacesQueries,
          useValue: {
            permissions: () => spaceEnv
          }
        },
        {
          provide: FilesManager,
          useValue: filesManager
        }
      ]
    }).compile()

    module.useLogger(['fatal'])
    filesMethods = module.get<FilesMethods>(FilesMethods)
    spacesManager = module.get<SpacesManager>(SpacesManager)
    filesQuotaManager = module.get<FilesQuotaManager>(FilesQuotaManager)
    userTest = new UserModel(generateUserTest())
    // mock
    filesQuotaManager.updateSpacesQuota = vi.fn().mockReturnValue(undefined)
  })

  it('should be defined', () => {
    expect(filesMethods).toBeDefined()
    expect(spacesManager).toBeDefined()
    expect(userTest).toBeDefined()
  })

  it('should avoid path traversal on CopyMove action', async () => {
    const copyMoveFileDto: CopyMoveFileDto = { dstDirectory: '../../../foo', dstName: '../bar/../' }
    expect(() => transformAndValidate(CopyMoveFileDto, copyMoveFileDto)).toThrow()
    await expect((filesMethods as any).copyMove(userTest, spaceEnv, copyMoveFileDto, false)).rejects.toThrow(/is not valid/i)
  })

  it('should avoid path traversal on Compress action', async () => {
    const compressFileDto: CompressFileDto = {
      name: '../../archive',
      compressInDirectory: false,
      files: [{ name: '../../foo', rootAlias: undefined }],
      extension: TAR_EXTENSION
    }
    expect(() => transformAndValidate(CompressFileDto, compressFileDto)).toThrow()
    await expect(filesMethods.compress(userTest, spaceEnv, compressFileDto)).rejects.toThrow(/does not exist/i)
    compressFileDto.files[0].path = '../../../bar/../'
    await expect(filesMethods.compress(userTest, spaceEnv, compressFileDto)).rejects.toThrow(/is not valid/i)
  })

  it('should preserve the cancellation reason from an abort error', async () => {
    const controller = new AbortController()
    const reason = new Error('Cancelled')
    const abortError = Object.assign(new Error('The operation was aborted', { cause: reason }), {
      code: 'ABORT_ERR',
      name: 'AbortError'
    })
    controller.abort(reason)
    filesManager.delete.mockRejectedValueOnce(abortError)

    await expect(filesMethods.delete(userTest, spaceEnv, null, controller.signal)).rejects.toBe(reason)
  })

  it('should keep a late operation error after the signal was aborted', async () => {
    const controller = new AbortController()
    const operationError = new Error('source cleanup failed')
    controller.abort(new Error('Cancelled'))
    filesManager.delete.mockRejectedValueOnce(operationError)

    await expect(filesMethods.delete(userTest, spaceEnv, null, controller.signal)).rejects.toEqual(
      new HttpException(operationError.message, HttpStatus.INTERNAL_SERVER_ERROR)
    )
  })
})
