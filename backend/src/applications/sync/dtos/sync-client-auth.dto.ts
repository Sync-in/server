/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { IsBoolean, IsDefined, IsNotEmpty, IsNotEmptyObject, IsObject, IsOptional, IsString, IsUUID } from 'class-validator'
import type { SyncClientInfo } from '../interfaces/sync-client.interface'

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
  @IsNotEmptyObject()
  @IsObject()
  info: SyncClientInfo

  @IsOptional()
  @IsBoolean()
  tokenHasExpired?: boolean
}
