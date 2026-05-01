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
import { DEFAULT_STORAGE_QUOTA_FIELD } from '../auth-providers.constants'

export class AuthProviderLDAPAttributesConfig {
  @IsOptional()
  @Transform(({ value }) => value || LDAP_LOGIN_ATTR.UID)
  @IsEnum(LDAP_LOGIN_ATTR)
  login: LDAP_LOGIN_ATTR = LDAP_LOGIN_ATTR.UID

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value || LDAP_COMMON_ATTR.MAIL)
  email: string = LDAP_COMMON_ATTR.MAIL

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value || DEFAULT_STORAGE_QUOTA_FIELD)
  storageQuota: string = DEFAULT_STORAGE_QUOTA_FIELD
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

  @IsOptional()
  @IsObject()
  tlsOptions?: Record<string, any> & { ca: string | string[] | Buffer }

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

  @IsOptional()
  @IsString()
  serviceBindDN?: string

  @IsOptional()
  @IsString()
  serviceBindPassword?: string

  @IsDefined()
  @IsNotEmptyObject()
  @IsObject()
  @ValidateNested()
  @Type(() => AuthProviderLDAPOptionsConfig)
  options: AuthProviderLDAPOptionsConfig = new AuthProviderLDAPOptionsConfig()
}
