/*
 * Copyright (C) 2012-2026 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { IsEnum, IsString } from 'class-validator'
import { SYNC_CLIENT_TYPE } from '../constants/sync'
import { SyncClientInfo } from '../interfaces/sync-client.interface'

export class SyncClientInfoDto implements SyncClientInfo {
  @IsString()
  node: string

  @IsString()
  os: string

  @IsString()
  osRelease: string

  @IsString()
  user: string

  @IsEnum(SYNC_CLIENT_TYPE)
  type: SYNC_CLIENT_TYPE

  @IsString()
  version: string
}
