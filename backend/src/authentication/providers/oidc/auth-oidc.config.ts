import { z } from 'zod'
import { USER_PERMISSION } from '../../../applications/users/constants/user.js'
import { hydrateConfigDefaults, nonEmptyStringSchema } from '../../../configuration/config.schema.js'
import { OAuthTokenEndpoint } from './auth-oidc.constants.js'
import { DEFAULT_STORAGE_QUOTA_FIELD } from '../auth-providers.constants.js'

type AuthProviderOIDCSecurityConfig = z.output<typeof AuthProviderOIDCSecurityConfigSchema>
type AuthProviderOIDCOptionsConfig = z.output<typeof AuthProviderOIDCOptionsConfigSchema>
export type AuthProviderOIDCConfig = z.output<typeof AuthProviderOIDCConfigSchema>

export function hydrateAuthProviderOIDCConfig(value: unknown): AuthProviderOIDCConfig | unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return value
  }

  const input = value as Record<string, unknown>
  return {
    ...input,
    options: hydrateOIDCOptions(input.options),
    security: hydrateOIDCSecurity(input.security)
  }
}

const defaultWhenFalsy =
  <T>(defaultValue: T) =>
  (value: unknown): unknown =>
    value || defaultValue

export const AuthProviderOIDCSecurityConfigSchema = z.looseObject({
  scope: z
    .string()
    .regex(/\bopenid\b/, 'OIDC scope must include "openid"')
    .default('openid email profile'),
  supportPKCE: z.boolean().nullish().default(true),
  allowInsecureRequests: z.boolean().nullish().default(false),
  tokenEndpointAuthMethod: z
    .preprocess(defaultWhenFalsy(OAuthTokenEndpoint.ClientSecretBasic), z.enum(OAuthTokenEndpoint))
    .default(OAuthTokenEndpoint.ClientSecretBasic),
  tokenSigningAlg: nonEmptyStringSchema.default('RS256'),
  userInfoSigningAlg: z.string().nullish(),
  skipSubjectCheck: z.boolean().nullish().default(false),
  requireVerifiedEmail: z.boolean().nullish().default(true),
  allowPrivateIpAvatarDownload: z.boolean().nullish().default(false)
})

export const AuthProviderOIDCOptionsConfigSchema = z.looseObject({
  autoCreateUser: z.boolean().nullish().default(true),
  autoCreatePermissions: z
    .array(z.enum(USER_PERMISSION))
    .nullish()
    .default(() => []),
  autoRedirect: z.boolean().nullish().default(false),
  enablePasswordAuth: z.boolean().nullish().default(false),
  autoSyncAvatar: z.boolean().nullish().default(false),
  adminRoleOrGroup: z.string().nullish(),
  storageQuotaClaim: z.preprocess(defaultWhenFalsy(DEFAULT_STORAGE_QUOTA_FIELD), z.string()).default(DEFAULT_STORAGE_QUOTA_FIELD),
  buttonText: nonEmptyStringSchema.default('Continue with OpenID Connect')
})

export const AuthProviderOIDCConfigSchema = z.looseObject({
  issuerUrl: nonEmptyStringSchema,
  clientId: nonEmptyStringSchema,
  clientSecret: nonEmptyStringSchema,
  redirectUri: nonEmptyStringSchema,
  options: AuthProviderOIDCOptionsConfigSchema.prefault({}),
  security: AuthProviderOIDCSecurityConfigSchema.prefault({})
})

function hydrateOIDCOptions(value: unknown): AuthProviderOIDCOptionsConfig | unknown {
  if (value === undefined) {
    return AuthProviderOIDCOptionsConfigSchema.parse({})
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return value
  }

  const options = hydrateConfigDefaults(AuthProviderOIDCOptionsConfigSchema.parse({}), value) as AuthProviderOIDCOptionsConfig
  options.storageQuotaClaim ||= DEFAULT_STORAGE_QUOTA_FIELD
  return options
}

function hydrateOIDCSecurity(value: unknown): AuthProviderOIDCSecurityConfig | unknown {
  if (value === undefined) {
    return AuthProviderOIDCSecurityConfigSchema.parse({})
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return value
  }

  const security = hydrateConfigDefaults(AuthProviderOIDCSecurityConfigSchema.parse({}), value) as AuthProviderOIDCSecurityConfig
  security.tokenEndpointAuthMethod ||= OAuthTokenEndpoint.ClientSecretBasic
  return security
}
