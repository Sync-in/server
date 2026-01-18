/*
 * Copyright (C) 2012-2026 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Transform, Type } from 'class-transformer'
import {
  ArrayNotEmpty,
  IsArray,
  IsDefined,
  IsEnum,
  IsNotEmpty,
  IsNotEmptyObject,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested
} from 'class-validator'
import { LDAP_COMMON_ATTR, LDAP_LOGIN_ATTR } from './auth-ldap.constants'

export class AuthMethodLDAPAttributesConfig {
  @IsOptional()
  @Transform(({ value }) => value || LDAP_LOGIN_ATTR.UID)
  @IsEnum(LDAP_LOGIN_ATTR)
  login: LDAP_LOGIN_ATTR = LDAP_LOGIN_ATTR.UID

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value || LDAP_COMMON_ATTR.MAIL)
  email: string = LDAP_COMMON_ATTR.MAIL
}

export class AuthMethodLDAPConfig {
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
  @Type(() => AuthMethodLDAPAttributesConfig)
  attributes: AuthMethodLDAPAttributesConfig = new AuthMethodLDAPAttributesConfig()

  @IsOptional()
  @IsString()
  adminGroup?: string

  @IsOptional()
  @IsString()
  upnSuffix?: string

  @IsOptional()
  @IsString()
  netbiosName?: string
}
