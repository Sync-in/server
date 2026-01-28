/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { IsDefined, IsNotEmpty, IsNotEmptyObject, IsObject, IsOptional, IsString, IsUUID } from 'class-validator'
import { SyncClientInfo } from '../interfaces/sync-client.interface'

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
  @IsNotEmptyObject()
  @IsObject()
  info: SyncClientInfo // TODO: create a DTO for validation
}

export class SyncClientAuthRegistrationDto {
  @IsOptional()
  @IsString()
  @IsUUID()
  clientId?: string

  @IsDefined()
  @IsNotEmptyObject()
  @IsObject()
  info: SyncClientInfo // TODO: create a DTO for validation
}
