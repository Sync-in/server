import { Test, TestingModule } from '@nestjs/testing'
import { UsersManager } from './services/users-manager.service'
import { WebSocketUsers } from './users.gateway'

describe(WebSocketUsers.name, () => {
  let gateway: WebSocketUsers

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WebSocketUsers, { provide: UsersManager, useValue: {} }]
    }).compile()

    gateway = module.get<WebSocketUsers>(WebSocketUsers)
  })

  it('should be defined', () => {
    expect(gateway).toBeDefined()
  })

  // describe('test', () => {
  //   it('should return ok', async () => {
  //     await expect(gateway.test('')).resolves.toBe('ok')
  //   })
  // })
})
