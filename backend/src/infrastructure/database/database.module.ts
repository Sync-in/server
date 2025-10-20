/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { DrizzleMySqlConfig, DrizzleMySqlModule } from '@knaadh/nestjs-drizzle-mysql2'
import { BeforeApplicationShutdown, Global, Inject, Module } from '@nestjs/common'
import { MySql2Client } from 'drizzle-orm/mysql2'
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
export class DatabaseModule implements BeforeApplicationShutdown {
  constructor(@Inject(DB_TOKEN_PROVIDER) private readonly db: DBSchema & { session: { client: MySql2Client } }) {}

  async beforeApplicationShutdown() {
    await this.db.session.client.end()
  }
}
