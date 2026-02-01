/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Type } from 'class-transformer'
import { IsBoolean, IsDefined, IsNotEmpty, IsNotEmptyObject, IsObject, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator'
import { SyncClientInfoDto } from './sync-client-info.dto'

export class SyncClientAuthDto {
  @IsNotEmpty()
  @IsString()
  @IsUUID()
  clientId: string

  @IsNotEmpty()
  @IsString()
  @IsUUID()
  token: string

  @IsDefined()
  @IsObject()
  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => SyncClientInfoDto)
  info: SyncClientInfoDto

  @IsOptional()
  @IsBoolean()
  tokenHasExpired?: boolean
}
