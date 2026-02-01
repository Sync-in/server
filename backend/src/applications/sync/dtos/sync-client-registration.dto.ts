/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Type } from 'class-transformer'
import { IsDefined, IsNotEmpty, IsNotEmptyObject, IsObject, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator'
import { SyncClientInfoDto } from './sync-client-info.dto'

export class SyncClientRegistrationDto {
  @IsNotEmpty()
  @IsString()
  login: string

  @IsNotEmpty()
  @IsString()
  password: string

  @IsOptional()
  @IsString()
  code?: string

  @IsNotEmpty()
  @IsString()
  @IsUUID()
  clientId: string

  @IsDefined()
  @IsObject()
  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => SyncClientInfoDto)
  info: SyncClientInfoDto
}

export class SyncClientAuthRegistrationDto {
  @IsOptional()
  @IsString()
  @IsUUID()
  clientId?: string

  @IsDefined()
  @IsObject()
  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => SyncClientInfoDto)
  info: SyncClientInfoDto
}
