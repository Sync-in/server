/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Test, TestingModule } from '@nestjs/testing'
import path from 'node:path'
import { transformAndValidate } from '../../../common/functions'
import { Cache } from '../../../infrastructure/cache/services/cache.service'
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
import { tarExtension } from '../constants/compress'
import { CompressFileDto, CopyMoveFileDto } from '../dto/file-operations.dto'
import { FilesManager } from './files-manager.service'
import { FilesMethods } from './files-methods.service'

describe(FilesMethods.name, () => {
  let filesMethods: FilesMethods
  let spacesManager: SpacesManager
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
        {
          provide: SpacesQueries,
          useValue: {
            permissions: () => spaceEnv
          }
        },
        { provide: FilesManager, useValue: {} }
      ]
    }).compile()

    module.useLogger(['fatal'])
    filesMethods = module.get<FilesMethods>(FilesMethods)
    spacesManager = module.get<SpacesManager>(SpacesManager)
    userTest = new UserModel(generateUserTest())
    // mock
    spacesManager.updateSpacesQuota = jest.fn().mockReturnValue(undefined)
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
      extension: tarExtension
    }
    expect(() => transformAndValidate(CompressFileDto, compressFileDto)).toThrow()
    await expect(filesMethods.compress(userTest, spaceEnv, compressFileDto)).rejects.toThrow(/does not exist/i)
    compressFileDto.files[0].path = '../../../bar/../'
    await expect(filesMethods.compress(userTest, spaceEnv, compressFileDto)).rejects.toThrow(/is not valid/i)
  })
})
