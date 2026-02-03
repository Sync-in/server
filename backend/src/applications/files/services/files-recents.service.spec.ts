import { Test, TestingModule } from '@nestjs/testing'
import { SharesQueries } from '../../shares/services/shares-queries.service'
import { SpacesQueries } from '../../spaces/services/spaces-queries.service'
import { FilesQueries } from './files-queries.service'
import { FilesRecents } from './files-recents.service'

describe(FilesRecents.name, () => {
  let service: FilesRecents

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesRecents,
        { provide: FilesQueries, useValue: {} },
        { provide: SpacesQueries, useValue: {} },
        {
          provide: SharesQueries,
          useValue: {}
        }
      ]
    }).compile()

    service = module.get<FilesRecents>(FilesRecents)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })
})
