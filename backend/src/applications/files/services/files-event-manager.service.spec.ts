import { Test, TestingModule } from '@nestjs/testing'
import { FilesEventManager } from './files-event-manager.service'
import { Cache } from '../../../infrastructure/cache/services/cache.service'

describe(FilesEventManager.name, () => {
  let service: FilesEventManager

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesEventManager,
        {
          provide: Cache,
          useValue: {}
        }
      ]
    }).compile()

    service = module.get<FilesEventManager>(FilesEventManager)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })
})
