/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { IsInt, IsNotEmpty, IsString, MinLength, ValidateIf } from 'class-validator'
import { USER_PASSWORD_MIN_LENGTH } from '../constants/user'

export class UserLanguageDto {
  @ValidateIf((_, language) => language === null || typeof language === 'string')
  language: string | null
}

export class UserNotificationDto {
  @IsNotEmpty()
  @IsInt()
  notification: number
}

export class UserUpdatePasswordDto {
  @IsNotEmpty()
  @IsString()
  oldPassword: string

  @IsNotEmpty()
  @IsString()
  @MinLength(USER_PASSWORD_MIN_LENGTH)
  newPassword: string
}

export class UserPasswordDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(USER_PASSWORD_MIN_LENGTH)
  password: string
}
