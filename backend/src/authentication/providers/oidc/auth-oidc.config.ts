/*
 * Copyright (C) 2012-2026 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Transform } from 'class-transformer'
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator'
import { OAuthTokenEndpoint } from './auth-oidc.constants'

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

  @IsOptional()
  @Transform(({ value }) => value || OAuthTokenEndpoint.ClientSecretBasic)
  @IsEnum(OAuthTokenEndpoint)
  clientAuthMethod: OAuthTokenEndpoint = OAuthTokenEndpoint.ClientSecretBasic

  @IsString()
  @IsNotEmpty()
  redirectUri: string

  @IsOptional()
  @IsString()
  scope?: string

  @IsOptional()
  @IsBoolean()
  autoCreateUser? = true

  @IsOptional()
  @IsBoolean()
  skipSubjectCheck? = false

  @IsOptional()
  @IsString()
  adminRoleOrGroup?: string
}
