/*
 * Copyright (C) 2012-2026 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Transform, Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsDefined,
  IsEnum,
  IsNotEmpty,
  IsNotEmptyObject,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  ValidateNested
} from 'class-validator'
import { USER_PERMISSION } from '../../../applications/users/constants/user'
import { OAuthTokenEndpoint } from './auth-oidc.constants'

export class AuthMethodOIDCSecurityConfig {
  @IsString()
  @Matches(/\bopenid\b/, { message: 'OIDC scope must include "openid"' })
  scope = 'openid email profile'

  @Transform(({ value }) => value || OAuthTokenEndpoint.ClientSecretBasic)
  @IsEnum(OAuthTokenEndpoint)
  tokenEndpointAuthMethod: OAuthTokenEndpoint = OAuthTokenEndpoint.ClientSecretBasic

  @IsString()
  @IsNotEmpty()
  tokenSigningAlg = 'RS256'

  @IsOptional()
  @IsString()
  userInfoSigningAlg? = undefined

  @IsOptional()
  @IsBoolean()
  skipSubjectCheck? = false
}

export class AuthMethodOIDCOptionsConfig {
  @IsOptional()
  @IsBoolean()
  autoCreateUser? = true

  @IsOptional()
  @IsArray()
  @IsEnum(USER_PERMISSION, { each: true })
  autoCreatePermissions?: USER_PERMISSION[] = []

  @IsOptional()
  @IsBoolean()
  autoRedirect? = false

  @IsOptional()
  @IsBoolean()
  enablePasswordAuth? = true

  @IsOptional()
  @IsString()
  adminRoleOrGroup?: string

  @IsString()
  @IsNotEmpty()
  buttonText: string = 'Continue with OpenID Connect'
}

export class AuthMethodOIDCConfig {
  @IsString()
  @IsNotEmpty()
  issuerUrl: string

  @IsString()
  @IsNotEmpty()
  clientId: string

  @IsString()
  @IsNotEmpty()
  clientSecret: string

  @IsString()
  @IsNotEmpty()
  redirectUri: string

  @IsDefined()
  @IsNotEmptyObject()
  @IsObject()
  @ValidateNested()
  @Type(() => AuthMethodOIDCOptionsConfig)
  options: AuthMethodOIDCOptionsConfig = new AuthMethodOIDCOptionsConfig()

  @IsDefined()
  @IsNotEmptyObject()
  @IsObject()
  @ValidateNested()
  @Type(() => AuthMethodOIDCSecurityConfig)
  security: AuthMethodOIDCSecurityConfig = new AuthMethodOIDCSecurityConfig()
}
