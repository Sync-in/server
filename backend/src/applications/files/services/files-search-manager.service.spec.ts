import { Test, TestingModule } from '@nestjs/testing'
import { SharesQueries } from '../../shares/services/shares-queries.service'
import { SpacesQueries } from '../../spaces/services/spaces-queries.service'
import { FilesContentStore } from '../models/files-content-store'
import { FilesParser } from './files-parser.service'
import { FilesSearchManager } from './files-search-manager.service'

describe(FilesSearchManager.name, () => {
  let service: FilesSearchManager

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesSearchManager,
        { provide: FilesContentStore, useValue: {} },
        { provide: FilesParser, useValue: {} },
        {
          provide: SpacesQueries,
          useValue: {}
        },
        { provide: SharesQueries, useValue: {} }
      ]
    }).compile()

    service = module.get<FilesSearchManager>(FilesSearchManager)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })
})
