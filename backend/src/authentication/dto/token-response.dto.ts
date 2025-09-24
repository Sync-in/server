/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { IsInt, IsOptional, IsString } from 'class-validator'

export class TokenResponseDto {
  @IsString()
  access: string

  @IsString()
  refresh: string

  @IsInt()
  access_expiration: number

  @IsInt()
  refresh_expiration: number

  @IsOptional()
  @IsInt()
  access_2fa_expiration?: number
}
