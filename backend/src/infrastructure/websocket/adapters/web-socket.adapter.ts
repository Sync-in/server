import { Injectable, Logger } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { NestFastifyApplication } from '@nestjs/platform-fastify'
import { IoAdapter } from '@nestjs/platform-socket.io'
import { WsException } from '@nestjs/websockets'
import { parse } from 'cookie'
import cluster from 'node:cluster'
import { Namespace, ServerOptions, Socket } from 'socket.io'
import { USERS_WS } from '../../../applications/users/constants/websocket'
import { type JwtPayload } from '../../../authentication/interfaces/jwt-payload.interface'
import { configuration } from '../../../configuration/config.environment'
import { getClientAddress } from '../utils'
import { ClusterAdapter } from './cluster.adapter'
import { RedisAdapter } from './redis.adapter'

@Injectable()
export class WebSocketAdapter extends IoAdapter {
  private adapter: RedisAdapter | ClusterAdapter
  private readonly app: NestFastifyApplication
  private readonly logger: Logger = new Logger(WebSocketAdapter.name)
  private readonly jwtService: JwtService

  constructor(app: NestFastifyApplication) {
    super(app)
    this.app = app
    this.jwtService = app.get<JwtService>(JwtService)
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

  private authenticateSocket(socket: Socket, next: (err?: Error) => void) {
    const cookies = socket.request.headers.cookie ? parse(socket.request.headers.cookie) : {}
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
    Object.assign(socket, { user: payload.identity })
    next()
  }

  private onAuthError(error: string, socket: Socket, next: (err?: Error) => void) {
    this.logger.warn(`${error} - ${getClientAddress(socket)} ${socket.id} ${socket.handshake.url} ${socket.handshake.headers['user-agent']}`)
    next(new WsException('Unauthorized'))
  }
}
