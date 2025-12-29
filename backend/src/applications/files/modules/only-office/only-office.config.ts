/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { IsBoolean, IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator'

export class OnlyOfficeConfig {
  @IsBoolean()
  enabled = false

  @IsOptional()
  @IsString()
  externalServer: string = null

  @ValidateIf((o: OnlyOfficeConfig) => o.enabled)
  @IsString()
  @IsNotEmpty()
  secret: string

  @IsBoolean()
  verifySSL: boolean = false
}
