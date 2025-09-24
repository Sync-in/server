/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Transform, Type } from 'class-transformer'
import {
  IsBoolean,
  IsDefined,
  IsInt,
  IsIP,
  IsNotEmpty,
  IsNotEmptyObject,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested
} from 'class-validator'
import { cpus } from 'node:os'
import type { Level } from 'pino'
import { ApplicationsConfig } from '../applications/applications.config'
import { AuthConfig } from '../authentication/auth.config'
import { CacheConfig } from '../infrastructure/cache/cache.config'
import { MySQLConfig } from '../infrastructure/database/database.config'
import { MailerConfig } from '../infrastructure/mailer/mailer.config'
import { WebSocketConfig } from '../infrastructure/websocket/web-socket.config'
import { DEFAULT_LOG_FILE_PATH } from './config.constants'

export class ServerConfig {
  @IsIP()
  host: string = '0.0.0.0'

  @IsInt()
  @Min(1024)
  @Max(65535)
  port: number = 8080

  @Transform(({ value }) => (value === 0 || value === 'auto' ? cpus().length : Math.max(Number(value), 2)))
  @IsInt()
  @Min(2)
  workers: number = 2

  @IsOptional()
  trustProxy: boolean | string | number = 1

  @IsBoolean()
  restartOnFailure: boolean = true
}

export class LoggerConfig {
  @IsString()
  @IsNotEmpty()
  level: Level = 'info'

  @IsBoolean()
  stdout: boolean = true

  @IsBoolean()
  colorize: boolean = true

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value || DEFAULT_LOG_FILE_PATH)
  filePath: string = DEFAULT_LOG_FILE_PATH
}

export class GlobalConfig {
  @IsDefined()
  @IsObject()
  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => ServerConfig)
  server: ServerConfig = new ServerConfig()

  @IsDefined()
  @IsObject()
  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => LoggerConfig)
  logger: LoggerConfig = new LoggerConfig()

  @IsDefined()
  @IsObject()
  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => MySQLConfig)
  mysql: MySQLConfig

  @IsDefined()
  @IsObject()
  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => CacheConfig)
  cache: CacheConfig = new CacheConfig()

  @IsOptional()
  @IsObject()
  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => WebSocketConfig)
  websocket: WebSocketConfig = new WebSocketConfig()

  @IsDefined()
  @IsObject()
  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => AuthConfig)
  auth: AuthConfig

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => MailerConfig)
  mail?: MailerConfig

  @IsDefined()
  @IsObject()
  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => ApplicationsConfig)
  applications: ApplicationsConfig
}
