import { HttpException, HttpStatus } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { configuration } from '../../../../configuration/config.environment.js'
import { ContextManager } from '../../../../infrastructure/context/services/context-manager.service.js'
import type { SpaceEnv } from '../../../spaces/models/space-env.model.js'
import * as filesUtils from '../../utils/files.js'
import { DrawioManager } from './drawio-manager.service.js'

vi.mock('../../utils/files.js')

describe(DrawioManager.name, () => {
  let service: DrawioManager
  let contextManager: ContextManager
  let previousExternalServer: string

  const mockSpace = {
    realPath: '/path/to/diagram.drawio'
  } as SpaceEnv

  beforeEach(async () => {
    previousExternalServer = configuration.applications.files.editors.drawio.externalServer
    configuration.applications.files.editors.drawio.externalServer = null
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DrawioManager,
        {
          provide: ContextManager,
          useValue: {
            publicOriginUrl: vi.fn().mockReturnValue('https://sync-in.test')
          }
        }
      ]
    }).compile()

    module.useLogger(['fatal'])
    service = module.get<DrawioManager>(DrawioManager)
    contextManager = module.get<ContextManager>(ContextManager)
    vi.mocked(filesUtils.isPathExists).mockResolvedValue(true)
    vi.mocked(filesUtils.isPathIsDir).mockResolvedValue(false)
  })

  afterEach(() => {
    configuration.applications.files.editors.drawio.externalServer = previousExternalServer
    vi.clearAllMocks()
  })

  it('returns the local draw.io URL for .drawio files', async () => {
    await expect(service.getSettings(mockSpace)).resolves.toEqual({
      documentServerUrl: 'https://sync-in.test/drawio/'
    })
  })

  it('supports .dwb files', async () => {
    const workbookSpace = { ...mockSpace, realPath: '/path/to/diagram.dwb' } as SpaceEnv

    await expect(service.getSettings(workbookSpace)).resolves.toEqual({
      documentServerUrl: 'https://sync-in.test/drawio/'
    })
  })

  it.each(['vsdx', 'gliffy'])('supports importing .%s files', async (extension) => {
    const importedSpace = { ...mockSpace, realPath: `/path/to/diagram.${extension}` } as SpaceEnv

    await expect(service.getSettings(importedSpace)).resolves.toEqual({
      documentServerUrl: 'https://sync-in.test/drawio/'
    })
  })

  it('returns the configured external draw.io URL', async () => {
    const drawioConfig = configuration.applications.files.editors.drawio
    const localExternalServer = drawioConfig.externalServer
    drawioConfig.externalServer = 'https://embed.diagrams.net/'

    try {
      const externalService = new DrawioManager(contextManager)
      await expect(externalService.getSettings(mockSpace)).resolves.toEqual({
        documentServerUrl: 'https://embed.diagrams.net/'
      })
    } finally {
      drawioConfig.externalServer = localExternalServer
    }
  })

  it('rejects unsupported files', async () => {
    const unsupportedSpace = { ...mockSpace, realPath: '/path/to/diagram.svg' } as SpaceEnv

    await expect(service.getSettings(unsupportedSpace)).rejects.toThrow(new HttpException('Diagram format not supported', HttpStatus.BAD_REQUEST))
  })

  it('rejects missing files', async () => {
    vi.mocked(filesUtils.isPathExists).mockResolvedValue(false)

    await expect(service.getSettings(mockSpace)).rejects.toThrow(new HttpException('Diagram not found', HttpStatus.NOT_FOUND))
  })

  it('rejects directories', async () => {
    vi.mocked(filesUtils.isPathIsDir).mockResolvedValue(true)

    await expect(service.getSettings(mockSpace)).rejects.toThrow(new HttpException('Diagram must be a file', HttpStatus.BAD_REQUEST))
  })

  it('rejects a missing public origin for the local editor', async () => {
    vi.spyOn(contextManager, 'publicOriginUrl').mockReturnValue(undefined)

    await expect(service.getSettings(mockSpace)).rejects.toThrow(
      new HttpException('Draw.io public URL is unavailable', HttpStatus.SERVICE_UNAVAILABLE)
    )
  })
})
