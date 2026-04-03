import { Test, TestingModule } from '@nestjs/testing'
import { FilesQuotaManager } from './files-quota-manager.service'
import { SpacesQueries } from '../../spaces/services/spaces-queries.service'
import { UsersQueries } from '../../users/services/users-queries.service'
import { SharesQueries } from '../../shares/services/shares-queries.service'

describe(FilesQuotaManager.name, () => {
  let service: FilesQuotaManager

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesQuotaManager,
        { provide: SpacesQueries, useValue: {} },
        { provide: UsersQueries, useValue: {} },
        { provide: SharesQueries, useValue: {} }
      ]
    }).compile()

    service = module.get<FilesQuotaManager>(FilesQuotaManager)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })
})
