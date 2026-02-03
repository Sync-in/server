import { Transform, Type } from 'class-transformer'
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDefined,
  IsEnum,
  IsNotEmpty,
  IsNotEmptyObject,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested
} from 'class-validator'
import { USER_PERMISSION } from '../../../applications/users/constants/user'
import { LDAP_COMMON_ATTR, LDAP_LOGIN_ATTR } from './auth-ldap.constants'

export class AuthProviderLDAPAttributesConfig {
  @IsOptional()
  @Transform(({ value }) => value || LDAP_LOGIN_ATTR.UID)
  @IsEnum(LDAP_LOGIN_ATTR)
  login: LDAP_LOGIN_ATTR = LDAP_LOGIN_ATTR.UID

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value || LDAP_COMMON_ATTR.MAIL)
  email: string = LDAP_COMMON_ATTR.MAIL
}

export class AuthProviderLDAPOptionsConfig {
  @IsOptional()
  @IsString()
  adminGroup?: string

  @IsOptional()
  @IsBoolean()
  autoCreateUser? = true

  @IsOptional()
  @IsArray()
  @IsEnum(USER_PERMISSION, { each: true })
  autoCreatePermissions?: USER_PERMISSION[] = []

  @IsOptional()
  @IsBoolean()
  enablePasswordAuthFallback? = true
}

export class AuthProviderLDAPConfig {
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
  @Type(() => AuthProviderLDAPAttributesConfig)
  attributes: AuthProviderLDAPAttributesConfig = new AuthProviderLDAPAttributesConfig()

  @IsOptional()
  @IsString()
  upnSuffix?: string

  @IsOptional()
  @IsString()
  netbiosName?: string

  @IsDefined()
  @IsNotEmptyObject()
  @IsObject()
  @ValidateNested()
  @Type(() => AuthProviderLDAPOptionsConfig)
  options: AuthProviderLDAPOptionsConfig = new AuthProviderLDAPOptionsConfig()
}
