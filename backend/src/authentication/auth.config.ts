/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Exclude, Type } from 'class-transformer'
import { IsDefined, IsEnum, IsIn, IsNotEmpty, IsNotEmptyObject, IsObject, IsOptional, IsString, ValidateIf, ValidateNested } from 'class-validator'
import { ACCESS_KEY, CSRF_KEY, REFRESH_KEY, WS_KEY } from './constants/auth'
import { AUTH_PROVIDER } from './providers/auth-providers.constants'
import { AuthMethodLDAPConfig } from './providers/ldap/auth-ldap.config'
import { AuthMethodOIDCConfig } from './providers/oidc/auth-oidc.config'
import { AuthMFAConfig } from './providers/two-fa/auth-two-fa.config'

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

export class AuthConfig {
  @IsString()
  @IsEnum(AUTH_PROVIDER)
  method: AUTH_PROVIDER = AUTH_PROVIDER.MYSQL

  @IsOptional()
  @IsString()
  encryptionKey: string

  @IsDefined()
  @IsNotEmptyObject()
  @IsObject()
  @ValidateNested()
  @Type(() => AuthMFAConfig)
  mfa: AuthMFAConfig = new AuthMFAConfig()

  @IsString()
  @IsIn(['lax', 'strict'])
  cookieSameSite: 'lax' | 'strict' = 'strict'

  @IsDefined()
  @IsNotEmptyObject()
  @IsObject()
  @ValidateNested()
  @Type(() => AuthTokenConfig)
  token: AuthTokenConfig

  @ValidateIf((o: AuthConfig) => o.method === AUTH_PROVIDER.LDAP)
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => AuthMethodLDAPConfig)
  ldap: AuthMethodLDAPConfig

  @ValidateIf((o: AuthConfig) => o.method === AUTH_PROVIDER.OIDC)
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => AuthMethodOIDCConfig)
  oidc: AuthMethodOIDCConfig
}
