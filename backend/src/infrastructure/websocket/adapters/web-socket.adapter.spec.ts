import 'reflect-metadata'
import { Socket } from 'socket.io'
import { TOKEN_TYPE } from '../../../authentication/interfaces/token.interface'
import { configuration } from '../../../configuration/config.environment'
import { WebSocketAdapter } from './web-socket.adapter'

describe(WebSocketAdapter.name, () => {
  const token = 'signed-token'
  const identity = { id: 1, login: 'foo' }
  let adapter: WebSocketAdapter
  let jwtService: { verify: ReturnType<typeof vi.fn> }
  let socket: Socket
  let next: ReturnType<typeof vi.fn>

  beforeEach(() => {
    jwtService = {
      verify: vi.fn()
    }
    adapter = Object.create(WebSocketAdapter.prototype)
    Object.assign(adapter, {
      jwtService,
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

  it('should authenticate a socket with a WebSocket token', () => {
    jwtService.verify.mockReturnValue({
      tokenType: TOKEN_TYPE.WS,
      identity
    })

    Reflect.apply(Reflect.get(adapter, 'authenticateSocket'), adapter, [socket, next])

    expect(jwtService.verify).toHaveBeenCalledWith(token, {
      secret: configuration.auth.token.ws.secret
    })
    expect(socket).toHaveProperty('user', identity)
    expect(next).toHaveBeenCalledWith()
  })

  it.each([TOKEN_TYPE.ACCESS, TOKEN_TYPE.REFRESH, undefined])('should reject a token with type %s', (tokenType) => {
    jwtService.verify.mockReturnValue({
      tokenType,
      identity
    })

    Reflect.apply(Reflect.get(adapter, 'authenticateSocket'), adapter, [socket, next])

    expect(socket).not.toHaveProperty('user')
    expect(next).toHaveBeenCalledOnce()
    expect(next.mock.calls[0][0]).toMatchObject({
      message: 'Unauthorized'
    })
  })
})
