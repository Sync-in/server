/*
 * Copyright (C) 2012-2026 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Type } from 'class-transformer'
import { IsBoolean, IsDefined, IsNotEmptyObject, IsObject, IsString, ValidateNested } from 'class-validator'
import { SERVER_NAME } from '../../../common/shared'

export class AuthMFATotpConfig {
  @IsBoolean()
  enabled = true

  @IsString()
  issuer = SERVER_NAME
}

export class AuthMFAConfig {
  @IsDefined()
  @IsNotEmptyObject()
  @IsObject()
  @ValidateNested()
  @Type(() => AuthMFATotpConfig)
  totp: AuthMFATotpConfig = new AuthMFATotpConfig()
}
