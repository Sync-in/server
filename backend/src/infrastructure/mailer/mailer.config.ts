/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Type } from 'class-transformer'
import { IsBoolean, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator'

export class AuthMailConfig {
  @IsString()
  @IsNotEmpty()
  user: string

  @IsString()
  @IsNotEmpty()
  pass: string
}

export class MailerConfig {
  @IsString()
  @IsNotEmpty()
  host: string

  @IsInt()
  @Min(0)
  @Max(65535)
  port: number = 25

  @IsOptional()
  @IsBoolean()
  secure?: boolean = false

  @IsOptional()
  @IsBoolean()
  ignoreTLS?: boolean = false

  @IsOptional()
  @IsBoolean()
  rejectUnauthorized?: boolean = true

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AuthMailConfig)
  auth?: AuthMailConfig

  @IsOptional()
  @IsString()
  sender?: string = 'Sync-in<notification@sync-in.com>'

  @IsOptional()
  @IsBoolean()
  debug?: boolean = false

  @IsOptional()
  @IsBoolean()
  logger?: boolean = false
}
