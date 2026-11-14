import { type DrizzleMySqlConfig, DrizzleMySqlModule } from '@knaadh/nestjs-drizzle-mysql2'
import { BeforeApplicationShutdown, Global, Inject, Logger, Module, OnModuleInit, Optional } from '@nestjs/common'
import type { Connection, Pool, PoolConnection } from 'mysql2'
import { PinoLogger } from 'nestjs-pino'
import { setTimeout } from 'node:timers/promises'
import { configuration } from '../../configuration/config.environment.js'
import { INFRASTRUCTURE_CONNECTION_RETRY_DELAY, INFRASTRUCTURE_DEPENDENCY } from '../availability/availability.constants.js'
import { Availability } from '../availability/availability.service.js'
import { connectionErrorMessage, isRetryableConnectionError } from '../utils.js'
import { DB_CONNECTION_PROBE_TIMEOUT, DB_SESSION_INIT_QUERIES, DB_TOKEN_PROVIDER } from './constants.js'
import { DatabaseLogger } from './database.logger.js'
import type { DBSchema } from './interfaces/database.interface.js'
import * as schema from './schema.js'

@Global()
@Module({
  imports: [
    DrizzleMySqlModule.registerAsync({
      tag: DB_TOKEN_PROVIDER,
      useFactory: (): DrizzleMySqlConfig => ({
        mysql: {
          connection: 'pool',
          config: {
            uri: configuration.mysql.url,
            connectionLimit: 10
          }
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
  private recoveryPromise?: Promise<void>
  private poolClosed = false

  constructor(
    @Inject(DB_TOKEN_PROVIDER) private readonly db: DBSchema,
    private readonly availability: Availability,
    @Optional() private readonly pinoLogger?: PinoLogger
  ) {
    this.pool = this.db.$client
    this.availability.register(INFRASTRUCTURE_DEPENDENCY.DATABASE)
  }

  async onModuleInit(): Promise<void> {
    this.pool.on('connection', (conn: Connection) => {
      // this.logger.debug(`MySQL pool connection created (thread ID: ${conn.threadId})`)
      // conn.once('end', () => this.logger.debug(`MySQL pool connection removed (thread ID: ${conn.threadId})`))
      conn.once('error', (error: unknown) => {
        // A pooled connection can retain the context of the request that created it.
        // Start recovery from the root logger to avoid leaking request metadata.
        if (this.pinoLogger) {
          this.pinoLogger.runInContext(() => this.handleConnectionError(error), { inherit: false })
        } else {
          this.handleConnectionError(error)
        }
      })
      for (const query of DB_SESSION_INIT_QUERIES) {
        conn.query(query)
      }
    })

    await this.waitUntilAvailable()
  }

  async beforeApplicationShutdown(): Promise<void> {
    this.availability.setAvailable(INFRASTRUCTURE_DEPENDENCY.DATABASE, false)
    this.shutdownController.abort()
    await this.recoveryPromise
    await this.closePool()
  }

  private async waitUntilAvailable(isRecovery = false): Promise<void> {
    while (!this.shutdownController.signal.aborted) {
      try {
        await this.runAvailabilityProbe()
        if (this.shutdownController.signal.aborted) return
        const wasAvailable = this.availability.isAvailable(INFRASTRUCTURE_DEPENDENCY.DATABASE)
        this.availability.setAvailable(INFRASTRUCTURE_DEPENDENCY.DATABASE, true)
        if (!isRecovery) {
          this.logger.log('Connected to MySQL server')
        } else if (wasAvailable) {
          this.logger.debug('Connection to MySQL server verified')
        } else {
          this.logger.log('Connection to MySQL server restored')
        }
        return
      } catch (error) {
        this.availability.setAvailable(INFRASTRUCTURE_DEPENDENCY.DATABASE, false)
        const message = `Unable to ${isRecovery ? 'reconnect to' : 'connect to'} MySQL server: ${connectionErrorMessage(error)}`
        if (!isRetryableConnectionError(error)) {
          if (!isRecovery) {
            await this.closePool()
            throw new Error(message, { cause: error })
          }
          this.logger.error(message)
          this.logger.error('MySQL connection cannot be retried without changing the configuration')
          return
        }
        this.logger.error(message)
        this.logger.warn(`Retrying connection to MySQL server in ${INFRASTRUCTURE_CONNECTION_RETRY_DELAY / 1000}s`)
        if (!(await this.waitRetryDelay())) return
      }
    }
  }

  private handleConnectionError(error: unknown): void {
    if (!this.availability.isAvailable(INFRASTRUCTURE_DEPENDENCY.DATABASE) || this.shutdownController.signal.aborted || this.recoveryPromise) {
      return
    }
    this.logger.warn(`MySQL pool connection lost: ${connectionErrorMessage(error)}`)
    this.recoveryPromise = this.recoverAvailability()
  }

  private async recoverAvailability(): Promise<void> {
    try {
      await this.waitUntilAvailable(true)
    } finally {
      this.recoveryPromise = undefined
    }
  }

  private runAvailabilityProbe(): Promise<void> {
    return new Promise((resolve, reject) => {
      let connection: PoolConnection | undefined
      let settled = false
      const finish = (error?: unknown): void => {
        if (settled) return
        settled = true
        globalThis.clearTimeout(timeout)
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      }

      const timeout = globalThis.setTimeout(() => {
        finish(Object.assign(new Error(`MySQL availability probe timed out after ${DB_CONNECTION_PROBE_TIMEOUT / 1000}s`), { code: 'ETIMEDOUT' }))
        connection?.destroy()
      }, DB_CONNECTION_PROBE_TIMEOUT)

      this.pool.getConnection((error, acquiredConnection) => {
        if (settled) {
          acquiredConnection?.release()
          return
        }
        if (error) {
          finish(error)
          return
        }

        connection = acquiredConnection
        acquiredConnection.query('SELECT 1', (queryError) => {
          acquiredConnection.release()
          finish(queryError ?? undefined)
        })
      })
    })
  }

  private async waitRetryDelay(): Promise<boolean> {
    try {
      await setTimeout(INFRASTRUCTURE_CONNECTION_RETRY_DELAY, undefined, { signal: this.shutdownController.signal })
      return true
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return false
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
