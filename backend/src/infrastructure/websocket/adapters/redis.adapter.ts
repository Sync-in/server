import { Logger } from '@nestjs/common'
import { IoAdapter } from '@nestjs/platform-socket.io'
import { ServerOptions } from 'socket.io'
import { loadOptionalModule } from '../../../common/functions'
import { redactRedisUrl } from '../../utils'
import type { WebSocketConfig } from '../web-socket.config'

export class RedisAdapter extends IoAdapter {
  private readonly logger = new Logger('WebSocketAdapter')
  private adapterConstructor: any
  private readonly reconnectOptions = { maxAttempts: 3, minConnectDelay: 6000, maxConnectDelay: 30000 }
  private readonly reconnectStrategy = (attempts: number): number => {
    if (attempts > this.reconnectOptions.maxAttempts) {
      this.logger.error('Too many retries on Redis server. Exiting')
      process.exit()
    } else {
      const wait: number = Math.min(this.reconnectOptions.minConnectDelay * Math.pow(2, attempts), this.reconnectOptions.maxConnectDelay)
      this.logger.warn(`Retrying connection to Redis server in ${wait / 1000}s`)
      return wait
    }
  }

  async connectToRedis(redisUrl: WebSocketConfig['redis']): Promise<void> {
    const redactedRedisUrl = redactRedisUrl(redisUrl)
    const { createAdapter } = await loadOptionalModule('@socket.io/redis-adapter')
    const { createClient } = await loadOptionalModule('redis')
    const pubClient = createClient({ url: redisUrl, socket: { noDelay: true, reconnectStrategy: this.reconnectStrategy } })
    const subClient = pubClient.duplicate()
    pubClient.on('error', (e: Error) => this.logger.error(`PubClient: ${e.message || e}`))
    pubClient.on('ready', () => this.logger.log(`PubClient: Connected to Redis Server at ${redactedRedisUrl}`))
    subClient.on('error', (e: Error) => this.logger.error(`SubClient: ${e.message || e}`))
    subClient.on('ready', () => this.logger.log(`SubClient: Connected to Redis Server at ${redactedRedisUrl}`))
    pubClient.connect()
    subClient.connect()
    this.adapterConstructor = createAdapter(pubClient, subClient)
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options)
    server.adapter(this.adapterConstructor)
    return server
  }
}
