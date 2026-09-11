import { type DrizzleMySqlConfig, DrizzleMySqlModule } from '@knaadh/nestjs-drizzle-mysql2'
import { BeforeApplicationShutdown, Global, Inject, Logger, Module, OnModuleInit } from '@nestjs/common'
import type { Connection, Pool } from 'mysql2'
import { setTimeout } from 'node:timers/promises'
import { configuration } from '../../configuration/config.environment'
import { INFRASTRUCTURE_CONNECTION_RETRY_DELAY, INFRASTRUCTURE_DEPENDENCY } from '../availability/availability.constants'
import { Availability } from '../availability/availability.service'
import { connectionErrorMessage, isRetryableConnectionError } from '../utils'
import { DB_SESSION_INIT_QUERIES, DB_TOKEN_PROVIDER } from './constants'
import { DatabaseLogger } from './database.logger'
import type { DBSchema } from './interfaces/database.interface'
import * as schema from './schema'

@Global()
@Module({
  imports: [
    DrizzleMySqlModule.registerAsync({
      tag: DB_TOKEN_PROVIDER,
      useFactory: (): DrizzleMySqlConfig => ({
        mysql: {
          connection: 'pool',
          config: configuration.mysql.url
        },
        config: {
          schema: { ...schema },
          mode: 'default',
          logger: configuration.mysql.logQueries ? new DatabaseLogger() : false
        }
      })
    })
  ]
})
export class DatabaseModule implements OnModuleInit, BeforeApplicationShutdown {
  private readonly logger = new Logger(DatabaseModule.name)
  private readonly pool: Pool
  private readonly shutdownController = new AbortController()
  private monitorPromise?: Promise<void>
  private poolClosed = false

  constructor(
    @Inject(DB_TOKEN_PROVIDER) private readonly db: DBSchema,
    private readonly availability: Availability
  ) {
    this.pool = this.db.$client
    this.availability.register(INFRASTRUCTURE_DEPENDENCY.DATABASE)
  }

  async onModuleInit(): Promise<void> {
    this.pool.on('connection', (conn: Connection) => {
      conn.on('error', () => this.availability.setAvailable(INFRASTRUCTURE_DEPENDENCY.DATABASE, false))
      for (const query of DB_SESSION_INIT_QUERIES) {
        conn.query(query)
      }
    })

    await this.waitUntilAvailable()
    if (!this.shutdownController.signal.aborted) {
      this.monitorPromise = this.monitorAvailability()
    }
  }

  async beforeApplicationShutdown(): Promise<void> {
    this.availability.setAvailable(INFRASTRUCTURE_DEPENDENCY.DATABASE, false)
    this.shutdownController.abort()
    await this.monitorPromise
    await this.closePool()
  }

  private async waitUntilAvailable(): Promise<void> {
    while (!this.shutdownController.signal.aborted) {
      try {
        await this.pool.promise().query('SELECT 1')
        this.availability.setAvailable(INFRASTRUCTURE_DEPENDENCY.DATABASE, true)
        this.logger.log('Connected to MySQL server')
        return
      } catch (error) {
        this.availability.setAvailable(INFRASTRUCTURE_DEPENDENCY.DATABASE, false)
        const message = `Unable to connect to MySQL server: ${connectionErrorMessage(error)}`
        if (!isRetryableConnectionError(error)) {
          await this.closePool()
          throw new Error(message)
        }
        this.logger.error(message)
        this.logger.warn(`Retrying connection to MySQL server in ${INFRASTRUCTURE_CONNECTION_RETRY_DELAY / 1000}s`)
        if (!(await this.waitRetryDelay())) return
      }
    }
  }

  private async monitorAvailability(): Promise<void> {
    while (await this.waitRetryDelay()) {
      try {
        await this.pool.promise().query('SELECT 1')
        if (!this.availability.isAvailable(INFRASTRUCTURE_DEPENDENCY.DATABASE)) {
          this.logger.log('Connection to MySQL server restored')
        }
        this.availability.setAvailable(INFRASTRUCTURE_DEPENDENCY.DATABASE, true)
      } catch (error) {
        this.availability.setAvailable(INFRASTRUCTURE_DEPENDENCY.DATABASE, false)
        const message = `Connection to MySQL server lost: ${connectionErrorMessage(error)}`
        this.logger.error(message)
        if (!isRetryableConnectionError(error)) {
          this.logger.error('MySQL connection cannot be retried without changing the configuration')
          return
        }
        this.logger.warn(`Retrying connection to MySQL server in ${INFRASTRUCTURE_CONNECTION_RETRY_DELAY / 1000}s`)
      }
    }
  }

  private async waitRetryDelay(): Promise<boolean> {
    try {
      await setTimeout(INFRASTRUCTURE_CONNECTION_RETRY_DELAY, undefined, { signal: this.shutdownController.signal })
      return true
    } catch (error) {
      if ((error as Error).name === 'AbortError') return false
      throw error
    }
  }

  private async closePool(): Promise<void> {
    if (!this.poolClosed) {
      this.poolClosed = true
      await this.pool.promise().end()
    }
  }
}
