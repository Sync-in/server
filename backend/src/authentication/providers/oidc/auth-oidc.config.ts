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
import { DEFAULT_STORAGE_QUOTA_FIELD } from '../auth-providers.constants'

export class AuthProviderOIDCSecurityConfig {
  @IsString()
  @Matches(/\bopenid\b/, { message: 'OIDC scope must include "openid"' })
  scope = 'openid email profile'

  @IsOptional()
  @IsBoolean()
  supportPKCE? = true

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

export class AuthProviderOIDCOptionsConfig {
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

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value || DEFAULT_STORAGE_QUOTA_FIELD)
  storageQuotaClaim?: string = DEFAULT_STORAGE_QUOTA_FIELD

  @IsString()
  @IsNotEmpty()
  buttonText: string = 'Continue with OpenID Connect'
}

export class AuthProviderOIDCConfig {
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
  @Type(() => AuthProviderOIDCOptionsConfig)
  options: AuthProviderOIDCOptionsConfig = new AuthProviderOIDCOptionsConfig()

  @IsDefined()
  @IsNotEmptyObject()
  @IsObject()
  @ValidateNested()
  @Type(() => AuthProviderOIDCSecurityConfig)
  security: AuthProviderOIDCSecurityConfig = new AuthProviderOIDCSecurityConfig()
}
