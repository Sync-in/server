import { Test, TestingModule } from '@nestjs/testing'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants'
import { FilesContentParser } from './files-content-parser.service'

describe(FilesContentParser.name, () => {
  let service: FilesContentParser

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FilesContentParser, { provide: DB_TOKEN_PROVIDER, useValue: {} }]
    }).compile()

    service = module.get<FilesContentParser>(FilesContentParser)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })
})
