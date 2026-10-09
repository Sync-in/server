import { z } from 'zod'
import { USER_PERMISSION } from '../../../applications/users/constants/user.js'
import { hydrateConfigDefaults, nonEmptyStringSchema } from '../../../configuration/config.schema.js'
import { LDAP_COMMON_ATTR, LDAP_LOGIN_ATTR } from './auth-ldap.constants.js'
import { DEFAULT_STORAGE_QUOTA_FIELD } from '../auth-providers.constants.js'

type AuthProviderLDAPAttributesConfig = z.output<typeof AuthProviderLDAPAttributesConfigSchema>
type AuthProviderLDAPOptionsConfig = z.output<typeof AuthProviderLDAPOptionsConfigSchema>
export type AuthProviderLDAPConfig = z.output<typeof AuthProviderLDAPConfigSchema>

export function hydrateAuthProviderLDAPConfig(value: unknown): AuthProviderLDAPConfig | unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return value
  }

  const input = value as Record<string, unknown>
  return {
    ...input,
    ...(Array.isArray(input.servers) ? { servers: input.servers.filter(Boolean) } : {}),
    attributes: hydrateLDAPAttributes(input.attributes),
    options: hydrateLDAPOptions(input.options)
  }
}

const defaultWhenFalsy =
  <T>(defaultValue: T) =>
  (value: unknown): unknown =>
    value || defaultValue

export const AuthProviderLDAPAttributesConfigSchema = z.looseObject({
  login: z.preprocess(defaultWhenFalsy(LDAP_LOGIN_ATTR.UID), z.enum(LDAP_LOGIN_ATTR)).default(LDAP_LOGIN_ATTR.UID),
  email: z.preprocess(defaultWhenFalsy(LDAP_COMMON_ATTR.MAIL), z.string()).default(LDAP_COMMON_ATTR.MAIL),
  storageQuota: z.preprocess(defaultWhenFalsy(DEFAULT_STORAGE_QUOTA_FIELD), z.string()).default(DEFAULT_STORAGE_QUOTA_FIELD)
})

export const AuthProviderLDAPOptionsConfigSchema = z.looseObject({
  adminGroup: z.string().nullish(),
  autoCreateUser: z.boolean().nullish().default(true),
  autoCreatePermissions: z
    .array(z.enum(USER_PERMISSION))
    .nullish()
    .default(() => []),
  enablePasswordAuthFallback: z.boolean().nullish().default(false)
})

export const AuthProviderLDAPConfigSchema = z.looseObject({
  servers: z.preprocess((value) => (Array.isArray(value) ? value.filter(Boolean) : value), z.array(z.string()).min(1)),
  tlsOptions: z.record(z.string(), z.unknown()).nullish(),
  baseDN: nonEmptyStringSchema,
  filter: z.string().nullish(),
  attributes: AuthProviderLDAPAttributesConfigSchema.prefault({}),
  upnSuffix: z.string().nullish(),
  netbiosName: z.string().nullish(),
  serviceBindDN: z.string().nullish(),
  serviceBindPassword: z.string().nullish(),
  options: AuthProviderLDAPOptionsConfigSchema.prefault({})
})

function hydrateLDAPAttributes(value: unknown): AuthProviderLDAPAttributesConfig | unknown {
  if (value === undefined) {
    return AuthProviderLDAPAttributesConfigSchema.parse({})
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return value
  }

  const attributes = hydrateConfigDefaults(AuthProviderLDAPAttributesConfigSchema.parse({}), value) as AuthProviderLDAPAttributesConfig
  attributes.login ||= LDAP_LOGIN_ATTR.UID
  attributes.email ||= LDAP_COMMON_ATTR.MAIL
  attributes.storageQuota ||= DEFAULT_STORAGE_QUOTA_FIELD
  return attributes
}

function hydrateLDAPOptions(value: unknown): AuthProviderLDAPOptionsConfig | unknown {
  if (value === undefined) {
    return AuthProviderLDAPOptionsConfigSchema.parse({})
  }
  return hydrateConfigDefaults(AuthProviderLDAPOptionsConfigSchema.parse({}), value)
}
