import { Injectable, Logger } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { NestFastifyApplication } from '@nestjs/platform-fastify'
import { IoAdapter } from '@nestjs/platform-socket.io'
import { WsException } from '@nestjs/websockets'
import { type FastifyInstance } from 'fastify'
import cluster from 'node:cluster'
import { Namespace, ServerOptions, Socket } from 'socket.io'
import { USERS_WS } from '../../../applications/users/constants/websocket'
import { UserModel } from '../../../applications/users/models/user.model'
import { UsersManager } from '../../../applications/users/services/users-manager.service'
import { type JwtPayload } from '../../../authentication/interfaces/jwt-payload.interface'
import { TOKEN_TYPE } from '../../../authentication/interfaces/token.interface'
import { configuration } from '../../../configuration/config.environment'
import { getClientAddress } from '../utils'
import { ClusterAdapter } from './cluster.adapter'
import { RedisAdapter } from './redis.adapter'

@Injectable()
export class WebSocketAdapter extends IoAdapter {
  private adapter: RedisAdapter | ClusterAdapter
  private readonly app: NestFastifyApplication
  private readonly fastify: FastifyInstance
  private readonly logger: Logger = new Logger(WebSocketAdapter.name)
  private readonly jwtService: JwtService
  private readonly usersManager: UsersManager

  constructor(app: NestFastifyApplication) {
    super(app)
    this.app = app
    this.fastify = app.getHttpAdapter().getInstance()
    this.jwtService = app.get<JwtService>(JwtService)
    this.usersManager = app.get<UsersManager>(UsersManager)
  }

  async initAdapter() {
    this.adapter = await this.getAdapter()
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = this.adapter.createIOServer(port, {
      ...options,
      cors: {
        origin: configuration.websocket.corsOrigin
      },
      transports: ['websocket']
    } satisfies ServerOptions)
    // Authentication
    server.use(this.authenticateSocket.bind(this))
    server.on('new_namespace', (namespace: Namespace) => {
      // apply auth on all namespaces
      namespace.use(this.authenticateSocket.bind(this))
    })
    this.logger.log(`Using ${server.of(USERS_WS.NAME_SPACE).adapter.constructor.name}`)
    return server
  }

  async getAdapter() {
    if (configuration.websocket.adapter === 'redis') {
      try {
        const redisIoAdapter = new RedisAdapter(this.app)
        await redisIoAdapter.connectToRedis(configuration.websocket.redis)
        return redisIoAdapter
      } catch (e) {
        this.logger.error(e.message)
        process.exit(1)
      }
    } else {
      if (cluster.isWorker) {
        // setup connection with the primary process
        return new ClusterAdapter(this.app)
      } else {
        this.logger.warn('Adapter Cluster only works in clustering mode', 'WEBSOCKET')
        // do not exit for tests (e2e)
      }
    }
  }

  private async authenticateSocket(socket: Socket, next: (err?: Error) => void) {
    const cookies = socket.request.headers.cookie ? this.fastify.parseCookie(socket.request.headers.cookie) : {}
    const token = cookies[configuration.auth.token.ws.name]
    if (!token) {
      this.onAuthError('Authorization is missing', socket, next)
      return
    }
    let payload: JwtPayload
    try {
      payload = this.jwtService.verify<JwtPayload>(token, { secret: configuration.auth.token.ws.secret })
    } catch (e) {
      this.onAuthError(e.message, socket, next)
      return
    }
    if (!payload) {
      this.onAuthError('Payload is missing', socket, next)
      return
    }
    if (payload.tokenType !== TOKEN_TYPE.WS) {
      this.onAuthError('Invalid token type', socket, next)
      return
    }
    let user: UserModel
    try {
      user = await this.usersManager.fromAuthToken(new UserModel(payload.identity))
    } catch (e) {
      this.onAuthError(e.message, socket, next)
      return
    }
    if (!user) {
      this.onAuthError('User is unavailable', socket, next)
      return
    }
    Object.assign(socket, { user })
    next()
  }

  private onAuthError(error: string, socket: Socket, next: (err?: Error) => void) {
    this.logger.warn(`${error} - ${getClientAddress(socket)} ${socket.id} ${socket.handshake.url} ${socket.handshake.headers['user-agent']}`)
    next(new WsException('Unauthorized'))
  }
}
