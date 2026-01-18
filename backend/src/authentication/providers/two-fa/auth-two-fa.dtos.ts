/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator'
import { LoginResponseDto } from '../../dto/login-response.dto'

export class TwoFaResponseDto extends LoginResponseDto {
  success: boolean
  message: string
}

export class TwoFaVerifyDto {
  @IsString()
  @IsNotEmpty()
  code!: string

  @IsOptional()
  @IsBoolean()
  isRecoveryCode?: boolean
}

export class TwoFaVerifyWithPasswordDto extends TwoFaVerifyDto {
  @IsString()
  @IsNotEmpty()
  password!: string
}
