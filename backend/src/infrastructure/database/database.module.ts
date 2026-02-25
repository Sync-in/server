import { DrizzleMySqlConfig, DrizzleMySqlModule } from '@knaadh/nestjs-drizzle-mysql2'
import { BeforeApplicationShutdown, Global, Inject, Module, OnModuleInit } from '@nestjs/common'
import { MySql2Client } from 'drizzle-orm/mysql2'
import { Connection, Pool } from 'mysql2'
import { configuration } from '../../configuration/config.environment'
import { DB_TOKEN_PROVIDER } from './constants'
import { DatabaseLogger } from './database.logger'
import type { DBSchema } from './interfaces/database.interface'
import * as schema from './schema'

@Global()
@Module({
  imports: [
    DrizzleMySqlModule.registerAsync({
      tag: DB_TOKEN_PROVIDER,
      useFactory: async (): Promise<DrizzleMySqlConfig> => ({
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
  constructor(@Inject(DB_TOKEN_PROVIDER) private readonly db: DBSchema & { session: { client: MySql2Client } }) {}

  onModuleInit() {
    const pool: Pool = (this.db as any).$client
    pool.on('connection', (conn: Connection) => {
      // Force UTC timezone for every new MySQL connection.
      conn.query(`SET time_zone = '+00:00'`)
    })
  }

  async beforeApplicationShutdown() {
    await this.db.session.client.end()
  }
}
