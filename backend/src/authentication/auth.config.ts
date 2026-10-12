import { z } from 'zod'
import { nonEmptyStringSchema } from '../configuration/config.schema.js'
import { ACCESS_KEY, CSRF_KEY, REFRESH_KEY, WS_KEY } from './constants/auth.js'
import { AUTH_PROVIDER } from './providers/auth-providers.constants.js'
import { type AuthProviderLDAPConfig, AuthProviderLDAPConfigSchema, hydrateAuthProviderLDAPConfig } from './providers/ldap/auth-ldap.config.js'
import { type AuthProviderOIDCConfig, AuthProviderOIDCConfigSchema, hydrateAuthProviderOIDCConfig } from './providers/oidc/auth-oidc.config.js'
import { AuthMFAConfigSchema } from './providers/two-fa/auth-two-fa.config.js'

export type AuthTokenAccessConfig = z.output<typeof AuthTokenAccessConfigSchema>
export type AuthTokenRefreshConfig = z.output<typeof AuthTokenRefreshConfigSchema>
export type AuthConfig = z.output<typeof AuthConfigSchema>

// Token and cookie names are fixed application identifiers.
// Missing or custom configuration values are replaced with the expected server-controlled name.
function createTokenConfigSchema(name: string, expiration: string) {
  return z.looseObject({
    name: z.literal(name).catch(name),
    secret: nonEmptyStringSchema,
    expiration: nonEmptyStringSchema.default(expiration)
  })
}

export const AuthTokenAccessConfigSchema = createTokenConfigSchema(ACCESS_KEY, '15m')
export const AuthTokenRefreshConfigSchema = createTokenConfigSchema(REFRESH_KEY, '4h')
export const AuthTokenCsrfConfigSchema = createTokenConfigSchema(CSRF_KEY, '4h')
export const AuthTokenWSConfigSchema = createTokenConfigSchema(WS_KEY, '4h')

export const AuthTokenConfigSchema = z.looseObject({
  access: AuthTokenAccessConfigSchema,
  refresh: AuthTokenRefreshConfigSchema,
  csrf: AuthTokenCsrfConfigSchema,
  ws: AuthTokenWSConfigSchema,
  // Derived by the loader; retain the former unchecked contract for these keys.
  access_2fa: z
    .custom<AuthTokenAccessConfig>()
    .optional()
    .transform((value) => value as AuthTokenAccessConfig),
  csrf_2fa: z
    .custom<AuthTokenAccessConfig>()
    .optional()
    .transform((value) => value as AuthTokenAccessConfig)
})

// Inactive providers keep their defaults without validating user-supplied values.
const inactiveLDAPConfigSchema = z
  .custom<AuthProviderLDAPConfig>()
  .optional()
  .transform((value) => hydrateAuthProviderLDAPConfig(value) as AuthProviderLDAPConfig)
const inactiveOIDCConfigSchema = z
  .custom<AuthProviderOIDCConfig>()
  .optional()
  .transform((value) => hydrateAuthProviderOIDCConfig(value) as AuthProviderOIDCConfig)

const authConfigShape = {
  encryptionKey: z.string().nullish(),
  mfa: AuthMFAConfigSchema.prefault({}),
  cookieSameSite: z.enum(['lax', 'strict']).default('strict'),
  token: AuthTokenConfigSchema
}

export const AuthConfigSchema = z.discriminatedUnion('provider', [
  z.looseObject({
    ...authConfigShape,
    provider: z.literal(AUTH_PROVIDER.MYSQL).default(AUTH_PROVIDER.MYSQL),
    ldap: inactiveLDAPConfigSchema,
    oidc: inactiveOIDCConfigSchema
  }),
  z.looseObject({
    ...authConfigShape,
    provider: z.literal(AUTH_PROVIDER.LDAP),
    ldap: AuthProviderLDAPConfigSchema,
    oidc: inactiveOIDCConfigSchema
  }),
  z.looseObject({
    ...authConfigShape,
    provider: z.literal(AUTH_PROVIDER.OIDC),
    ldap: inactiveLDAPConfigSchema,
    oidc: AuthProviderOIDCConfigSchema
  })
])
