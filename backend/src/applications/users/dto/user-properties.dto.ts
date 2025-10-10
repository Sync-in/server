/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Transform } from 'class-transformer'
import { IsBoolean, IsDate, IsDefined, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator'
import { AUTH_SCOPE } from '../../../authentication/constants/scope'
import { currentDate } from '../../../common/shared'
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

export class UserStorageIndexingDto {
  @IsDefined()
  @IsBoolean()
  storageIndexing: boolean
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

export class UserAppPasswordDto {
  @IsNotEmpty()
  @IsString()
  name: string

  @Transform(({ value }) => value.toLowerCase())
  @IsEnum(AUTH_SCOPE)
  app: AUTH_SCOPE

  @IsOptional()
  @Transform(({ value }) => (value ? currentDate(value) : null))
  @IsDate()
  expiration?: Date
}
