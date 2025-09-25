/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Exclude, Transform, Type } from 'class-transformer'
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsNotEmpty,
  IsNotEmptyObject,
  IsObject,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested
} from 'class-validator'
import { SERVER_NAME } from '../app.constants'
import { ACCESS_KEY, CSRF_KEY, REFRESH_KEY, WS_KEY } from './constants/auth'

export class AuthMfaTotpConfig {
  @IsBoolean()
  enabled = true

  @IsString()
  issuer = SERVER_NAME
}

export class AuthMfaConfig {
  @IsDefined()
  @IsNotEmptyObject()
  @IsObject()
  @ValidateNested()
  @Type(() => AuthMfaTotpConfig)
  totp: AuthMfaTotpConfig = new AuthMfaTotpConfig()
}

export class AuthTokenAccessConfig {
  @Exclude({ toClassOnly: true })
  // force default name
  name = ACCESS_KEY

  @IsString()
  @IsNotEmpty()
  secret: string

  @IsString()
  @IsNotEmpty()
  expiration = '30m'
}

export class AuthTokenRefreshConfig {
  @Exclude({ toClassOnly: true })
  // force default name
  name = REFRESH_KEY

  @IsString()
  @IsNotEmpty()
  secret: string

  @IsString()
  @IsNotEmpty()
  expiration = '4h'
}

export class AuthTokenCsrfConfig extends AuthTokenRefreshConfig {
  @IsString()
  @IsNotEmpty()
  override name: string = CSRF_KEY
}

export class AuthTokenWSConfig extends AuthTokenRefreshConfig {
  @IsString()
  @IsNotEmpty()
  override name: string = WS_KEY
}

export class AuthTokenConfig {
  @IsDefined()
  @IsNotEmptyObject()
  @IsObject()
  @ValidateNested()
  @Type(() => AuthTokenAccessConfig)
  access: AuthTokenAccessConfig

  @IsDefined()
  @IsNotEmptyObject()
  @IsObject()
  @ValidateNested()
  @Type(() => AuthTokenRefreshConfig)
  refresh: AuthTokenRefreshConfig

  @IsDefined()
  @IsNotEmptyObject()
  @IsObject()
  @ValidateNested()
  @Type(() => AuthTokenCsrfConfig)
  csrf: AuthTokenCsrfConfig

  @IsDefined()
  @IsNotEmptyObject()
  @IsObject()
  @ValidateNested()
  @Type(() => AuthTokenWSConfig)
  ws: AuthTokenWSConfig
}

export class AuthMethodLdapAttributesConfig {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value || 'uid')
  login? = 'uid'

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value || 'mail')
  email? = 'mail'
}

export class AuthMethodLdapConfig {
  @Transform(({ value }) => (Array.isArray(value) ? value.filter((v: string) => Boolean(v)) : value))
  @ArrayNotEmpty()
  @IsArray()
  @IsString({ each: true })
  servers: string[]

  @IsString()
  @IsNotEmpty()
  baseDN: string

  @IsOptional()
  @IsString()
  filter?: string

  @IsDefined()
  @IsNotEmptyObject()
  @IsObject()
  @ValidateNested()
  @Type(() => AuthMethodLdapAttributesConfig)
  attributes: AuthMethodLdapAttributesConfig = new AuthMethodLdapAttributesConfig()
}

export class AuthConfig {
  @IsString()
  @IsIn(['mysql', 'ldap'])
  method: 'mysql' | 'ldap' = 'mysql'

  @IsOptional()
  @IsString()
  encryptionKey: string

  @IsDefined()
  @IsNotEmptyObject()
  @IsObject()
  @ValidateNested()
  @Type(() => AuthMfaConfig)
  mfa: AuthMfaConfig = new AuthMfaConfig()

  @IsString()
  @IsIn(['lax', 'strict'])
  cookieSameSite: 'lax' | 'strict' = 'strict'

  @IsDefined()
  @IsNotEmptyObject()
  @IsObject()
  @ValidateNested()
  @Type(() => AuthTokenConfig)
  token: AuthTokenConfig

  @ValidateIf((o: AuthConfig) => o.method === 'ldap')
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => AuthMethodLdapConfig)
  ldap: AuthMethodLdapConfig
}
