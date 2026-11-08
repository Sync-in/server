import 'reflect-metadata'
import { Socket } from 'socket.io'
import type { Mock } from 'vitest'
import { UserModel } from '../../../applications/users/models/user.model.js'
import { TOKEN_TYPE } from '../../../authentication/interfaces/token.interface.js'
import { configuration } from '../../../configuration/config.environment.js'
import { WebSocketAdapter } from './web-socket.adapter.js'

describe(WebSocketAdapter.name, () => {
  const token = 'signed-token'
  const identity = { id: 1, login: 'foo' }
  let adapter: WebSocketAdapter
  let fastify: { parseCookie: ReturnType<typeof vi.fn> }
  let jwtService: { verify: ReturnType<typeof vi.fn> }
  let usersManager: { fromAuthToken: ReturnType<typeof vi.fn> }
  let socket: Socket
  let next: Mock<(err?: Error) => void>

  beforeEach(() => {
    jwtService = {
      verify: vi.fn()
    }
    usersManager = {
      fromAuthToken: vi.fn(async (user: UserModel): Promise<UserModel | null> => user)
    }
    fastify = {
      parseCookie: vi.fn(() => ({ [configuration.auth.token.ws.name]: token }))
    }
    adapter = Object.create(WebSocketAdapter.prototype)
    Object.assign(adapter, {
      fastify,
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
      id: 'socket-id',
      disconnect: vi.fn(),
      once: vi.fn()
    } as unknown as Socket
    next = vi.fn<(err?: Error) => void>()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should authenticate a socket with a WebSocket token', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'))
    const exp = Date.now() / 1000 + 3600
    jwtService.verify.mockReturnValue({
      tokenType: TOKEN_TYPE.WS,
      identity,
      exp
    })

    await adapter['authenticateSocket'](socket, next)

    expect(fastify.parseCookie).toHaveBeenCalledWith(`${configuration.auth.token.ws.name}=${token}`)
    expect(jwtService.verify).toHaveBeenCalledWith(token, {
      secret: configuration.auth.token.ws.secret
    })
    expect(usersManager.fromAuthToken).toHaveBeenCalledOnce()
    expect(socket).toHaveProperty('user')
    expect(socket).toHaveProperty('tokenExpiresAt', exp * 1000)
    expect(next).toHaveBeenCalledWith()
  })

  it.each([TOKEN_TYPE.ACCESS, TOKEN_TYPE.REFRESH, undefined])('should reject a token with type %s', async (tokenType) => {
    jwtService.verify.mockReturnValue({
      tokenType,
      identity
    })

    await adapter['authenticateSocket'](socket, next)

    expect(socket).not.toHaveProperty('user')
    expect(next).toHaveBeenCalledOnce()
    expect(next.mock.calls[0][0]).toMatchObject({
      message: 'Unauthorized'
    })
  })

  it('should reject a WebSocket token when the current user is unavailable', async () => {
    jwtService.verify.mockReturnValue({
      tokenType: TOKEN_TYPE.WS,
      identity,
      exp: Date.now() / 1000 + 3600
    })
    usersManager.fromAuthToken.mockResolvedValue(null)

    await adapter['authenticateSocket'](socket, next)

    expect(socket).not.toHaveProperty('user')
    expect(socket.once).not.toHaveBeenCalled()
    expect(next.mock.calls[0][0]).toMatchObject({
      message: 'Unauthorized'
    })
  })

  it('should reject a WebSocket token without an expiration', async () => {
    jwtService.verify.mockReturnValue({ tokenType: TOKEN_TYPE.WS, identity })

    await adapter['authenticateSocket'](socket, next)

    expect(socket).not.toHaveProperty('user')
    expect(socket.once).not.toHaveBeenCalled()
    expect(next.mock.calls[0][0]).toMatchObject({
      message: 'Unauthorized'
    })
  })

  it('should disconnect the socket when the token expires', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'))
    const exp = Date.now() / 1000 + 3600
    jwtService.verify.mockReturnValue({ tokenType: TOKEN_TYPE.WS, identity, exp })

    await adapter['authenticateSocket'](socket, next)

    expect(next).toHaveBeenCalledWith()
    vi.advanceTimersByTime(3600 * 1000 - 1)
    expect(socket.disconnect).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(socket.disconnect).toHaveBeenCalledTimes(1)
    expect(socket.disconnect).toHaveBeenCalledWith(true)
  })

  it('should clear the timer when the socket disconnects first', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'))
    const exp = Date.now() / 1000 + 3600
    let disconnectHandler: (() => void) | undefined
    ;(socket.once as Mock).mockImplementation((event: string, cb: () => void) => {
      if (event === 'disconnect') disconnectHandler = cb
    })
    jwtService.verify.mockReturnValue({ tokenType: TOKEN_TYPE.WS, identity, exp })

    await adapter['authenticateSocket'](socket, next)

    expect(socket.once).toHaveBeenCalledWith('disconnect', expect.any(Function))
    disconnectHandler?.()
    vi.advanceTimersByTime(3600 * 1000)
    expect(socket.disconnect).not.toHaveBeenCalled()
  })

  it('should re-arm past the setTimeout ceiling and disconnect at exp', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'))
    const maxDelay = 2147483647
    const totalMs = 2_500_000_000 // beyond the setTimeout ceiling
    const exp = (Date.now() + totalMs) / 1000
    jwtService.verify.mockReturnValue({ tokenType: TOKEN_TYPE.WS, identity, exp })

    await adapter['authenticateSocket'](socket, next)

    vi.advanceTimersByTime(maxDelay)
    expect(socket.disconnect).not.toHaveBeenCalled()
    vi.advanceTimersByTime(totalMs - maxDelay - 1)
    expect(socket.disconnect).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(socket.disconnect).toHaveBeenCalledWith(true)
  })

  it('should not schedule a timer when authentication fails', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'))
    jwtService.verify.mockReturnValue({ tokenType: TOKEN_TYPE.ACCESS, identity, exp: Date.now() / 1000 + 3600 })

    await adapter['authenticateSocket'](socket, next)

    expect(socket.once).not.toHaveBeenCalled()
    vi.advanceTimersByTime(3600 * 1000)
    expect(socket.disconnect).not.toHaveBeenCalled()
  })
})
