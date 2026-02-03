import { StreamableFile } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { LinksController } from './links.controller'
import { LinksManager } from './services/links-manager.service'

describe(LinksController.name, () => {
  let controller: LinksController
  let linksManager: {
    linkValidation: jest.Mock
    linkAccess: jest.Mock
    linkAuthentication: jest.Mock
  }

  beforeAll(async () => {
    linksManager = {
      linkValidation: jest.fn(),
      linkAccess: jest.fn(),
      linkAuthentication: jest.fn()
    }

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LinksController],
      providers: [{ provide: LinksManager, useValue: linksManager }]
    }).compile()

    controller = module.get<LinksController>(LinksController)
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })

  describe('linkValidation', () => {
    it('should call LinksManager.linkValidation with provided user and uuid and return its result', async () => {
      const user = { id: 123, login: 'john' } as any
      const uuid = 'test-uuid-1'
      const expected = {
        error: true,
        ok: true,
        link: { id: 1, uuid, name: 'My Link' }
      } as any

      linksManager.linkValidation.mockResolvedValue(expected)

      const result = await controller.linkValidation(user, uuid)

      expect(linksManager.linkValidation).toHaveBeenCalledTimes(1)
      expect(linksManager.linkValidation).toHaveBeenCalledWith(user, uuid)
      expect(result).toBe(expected)
    })
  })

  describe('linkAccess', () => {
    it('should forward to LinksManager.linkAccess and return a StreamableFile', async () => {
      const user = { id: 42 } as any
      const uuid = 'test-uuid-2'
      const req = {} as any
      const res = {} as any
      const file = new StreamableFile(Buffer.from('data'))

      linksManager.linkAccess.mockResolvedValue(file)

      const result = await controller.linkAccess(user, uuid, req, res)

      expect(linksManager.linkAccess).toHaveBeenCalledTimes(1)
      expect(linksManager.linkAccess).toHaveBeenCalledWith(user, uuid, req, res)
      expect(result).toBe(file)
    })

    it('should forward to LinksManager.linkAccess and return a LoginResponseDto', async () => {
      const user = { id: 43 } as any
      const uuid = 'test-uuid-3'
      const req = {} as any
      const res = {} as any
      const loginResponse = { accessToken: 'token', refreshToken: 'refresh' } as any

      linksManager.linkAccess.mockResolvedValue(loginResponse)

      const result = await controller.linkAccess(user, uuid, req, res)

      expect(linksManager.linkAccess).toHaveBeenCalledTimes(1)
      expect(linksManager.linkAccess).toHaveBeenCalledWith(user, uuid, req, res)
      expect(result).toBe(loginResponse)
    })
  })

  describe('linkAuthentication', () => {
    it('should call LinksManager.linkAuthentication with provided params and return its result', async () => {
      const user = { id: 7 } as any
      const uuid = 'test-uuid-4'
      const body = { password: 'secret' } as any
      const req = {} as any
      const res = {} as any
      const expectedLogin = { accessToken: 'acc', refreshToken: 'ref' } as any

      linksManager.linkAuthentication.mockResolvedValue(expectedLogin)

      const result = await controller.linkAuthentication(user, uuid, body, req, res)

      expect(linksManager.linkAuthentication).toHaveBeenCalledTimes(1)
      expect(linksManager.linkAuthentication).toHaveBeenCalledWith(user, uuid, body, req, res)
      expect(result).toBe(expectedLogin)
    })
  })
})
