import { Test, TestingModule } from '@nestjs/testing'
import { Cache } from '../../../infrastructure/cache/services/cache.service'
import { SpacesManager } from '../../spaces/services/spaces-manager.service'
import { FilesManager } from './files-manager.service'
import { FilesMethods } from './files-methods.service'
import { FilesTasksManager } from './files-tasks-manager.service'

describe(FilesTasksManager.name, () => {
  let filesTasksManager: FilesTasksManager

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesTasksManager,
        { provide: FilesMethods, useValue: {} },
        { provide: FilesManager, useValue: {} },
        { provide: SpacesManager, useValue: {} },
        {
          provide: Cache,
          useValue: {}
        }
      ]
    }).compile()

    filesTasksManager = module.get<FilesTasksManager>(FilesTasksManager)
  })

  it('should be defined', () => {
    expect(filesTasksManager).toBeDefined()
  })
})
