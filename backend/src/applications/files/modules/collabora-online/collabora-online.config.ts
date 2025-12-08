/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { IsBoolean, IsOptional, IsString } from 'class-validator'

export class CollaboraOnlineConfig {
  @IsBoolean()
  enabled = false

  @IsOptional()
  @IsString()
  externalServer: string = null
}
