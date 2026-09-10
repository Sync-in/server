import { Logger } from '@nestjs/common'
import { NestFastifyApplication } from '@nestjs/platform-fastify'
import { IoAdapter } from '@nestjs/platform-socket.io'
import type { createAdapter as createRedisAdapter } from '@socket.io/redis-adapter'
import type { RedisClientType } from 'redis'
import { ServerOptions } from 'socket.io'
import { loadOptionalModule } from '../../../common/functions'
import { INFRASTRUCTURE_CONNECTION_RETRY_DELAY, INFRASTRUCTURE_DEPENDENCY } from '../../availability/availability.constants'
import { Availability } from '../../availability/availability.service'
import { connectionErrorMessage, isRetryableConnectionError, redactRedisUrl } from '../../utils'
import type { WebSocketConfig } from '../web-socket.config'

export class RedisAdapter extends IoAdapter {
  private readonly logger = new Logger('WebSocketAdapter')
  private readonly availability: Availability
  private adapterConstructor: ReturnType<typeof createRedisAdapter>
  private pubClient?: RedisClientType
  private subClient?: RedisClientType

  constructor(app: NestFastifyApplication) {
    super(app)
    this.availability = app.get(Availability)
    this.availability.register(INFRASTRUCTURE_DEPENDENCY.WEBSOCKET)
  }

  private readonly reconnectStrategy = (_attempts: number, cause: Error): number | Error => {
    this.availability.setAvailable(INFRASTRUCTURE_DEPENDENCY.WEBSOCKET, false)
    if (!isRetryableConnectionError(cause)) {
      return new Error(`Unable to connect to Redis WebSocket server: ${connectionErrorMessage(cause)}`)
    }
    this.logger.warn(`Retrying connection to Redis WebSocket server in ${INFRASTRUCTURE_CONNECTION_RETRY_DELAY / 1000}s`)
    return INFRASTRUCTURE_CONNECTION_RETRY_DELAY
  }

  async connect(redisUrl: WebSocketConfig['redis']): Promise<void> {
    const redactedRedisUrl = redactRedisUrl(redisUrl)
    const { createAdapter } = await loadOptionalModule('@socket.io/redis-adapter')
    const { createClient } = await loadOptionalModule('redis')
    const pubClient = createClient({ url: redisUrl, socket: { noDelay: true, reconnectStrategy: this.reconnectStrategy } })
    const subClient = pubClient.duplicate()
    this.pubClient = pubClient
    this.subClient = subClient
    this.registerClientEvents(pubClient, 'PubClient', redactedRedisUrl)
    this.registerClientEvents(subClient, 'SubClient', redactedRedisUrl)
    try {
      await Promise.all([pubClient.connect(), subClient.connect()])
    } catch (error) {
      await this.disconnect()
      throw error
    }
    this.updateAvailability()
    this.adapterConstructor = createAdapter(pubClient, subClient)
  }

  async disconnect(): Promise<void> {
    this.availability.setAvailable(INFRASTRUCTURE_DEPENDENCY.WEBSOCKET, false)
    const clients = [this.pubClient, this.subClient].filter((client): client is RedisClientType => !!client?.isOpen)
    await Promise.all(clients.map((client) => client.close()))
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options)
    server.adapter(this.adapterConstructor)
    return server
  }

  private registerClientEvents(client: RedisClientType, name: 'PubClient' | 'SubClient', redactedRedisUrl: string): void {
    client.on('error', (error: Error) => {
      this.updateAvailability()
      this.logger.error(`${name}: ${error.message || error}`)
    })
    client.on('reconnecting', () => this.updateAvailability())
    client.on('ready', () => {
      this.updateAvailability()
      this.logger.log(`${name}: Connected to Redis Server at ${redactedRedisUrl}`)
    })
  }

  private updateAvailability(): void {
    this.availability.setAvailable(INFRASTRUCTURE_DEPENDENCY.WEBSOCKET, this.pubClient?.isReady === true && this.subClient?.isReady === true)
  }
}
