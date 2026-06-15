import 'reflect-metadata'
import { Socket } from 'socket.io'
import { UserModel } from '../../../applications/users/models/user.model'
import { TOKEN_TYPE } from '../../../authentication/interfaces/token.interface'
import { configuration } from '../../../configuration/config.environment'
import { WebSocketAdapter } from './web-socket.adapter'

describe(WebSocketAdapter.name, () => {
  const token = 'signed-token'
  const identity = { id: 1, login: 'foo' }
  let adapter: WebSocketAdapter
  let jwtService: { verify: ReturnType<typeof vi.fn> }
  let usersManager: { fromAuthToken: ReturnType<typeof vi.fn> }
  let socket: Socket
  let next: ReturnType<typeof vi.fn>

  beforeEach(() => {
    jwtService = {
      verify: vi.fn()
    }
    usersManager = {
      fromAuthToken: vi.fn(async (user: UserModel): Promise<UserModel | null> => user)
    }
    adapter = Object.create(WebSocketAdapter.prototype)
    Object.assign(adapter, {
      jwtService,
      usersManager,
      logger: {
        warn: vi.fn()
      }
    })
    socket = {
      request: {
        headers: {
          cookie: `${configuration.auth.token.ws.name}=${token}`
        }
      },
      handshake: {
        address: '127.0.0.1',
        headers: {
          'user-agent': 'vitest'
        },
        url: '/'
      },
      id: 'socket-id'
    } as unknown as Socket
    next = vi.fn()
  })

  it('should authenticate a socket with a WebSocket token', async () => {
    jwtService.verify.mockReturnValue({
      tokenType: TOKEN_TYPE.WS,
      identity
    })

    await Reflect.apply(Reflect.get(adapter, 'authenticateSocket'), adapter, [socket, next])

    expect(jwtService.verify).toHaveBeenCalledWith(token, {
      secret: configuration.auth.token.ws.secret
    })
    expect(usersManager.fromAuthToken).toHaveBeenCalledOnce()
    expect(socket).toHaveProperty('user')
    expect(next).toHaveBeenCalledWith()
  })

  it.each([TOKEN_TYPE.ACCESS, TOKEN_TYPE.REFRESH, undefined])('should reject a token with type %s', async (tokenType) => {
    jwtService.verify.mockReturnValue({
      tokenType,
      identity
    })

    await Reflect.apply(Reflect.get(adapter, 'authenticateSocket'), adapter, [socket, next])

    expect(socket).not.toHaveProperty('user')
    expect(next).toHaveBeenCalledOnce()
    expect(next.mock.calls[0][0]).toMatchObject({
      message: 'Unauthorized'
    })
  })

  it('should reject a WebSocket token when the current user is unavailable', async () => {
    jwtService.verify.mockReturnValue({
      tokenType: TOKEN_TYPE.WS,
      identity
    })
    usersManager.fromAuthToken.mockResolvedValue(null)

    await Reflect.apply(Reflect.get(adapter, 'authenticateSocket'), adapter, [socket, next])

    expect(socket).not.toHaveProperty('user')
    expect(next.mock.calls[0][0]).toMatchObject({
      message: 'Unauthorized'
    })
  })
})
