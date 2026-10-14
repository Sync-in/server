import { SAMPLE_DOCUMENT_GROUPS } from '../applications/files/constants/samples.js'
import { FilesContentIndexingConfigSchema } from '../applications/files/files.config.js'
import { OnlyOfficeConfigSchema } from '../applications/files/editors/only-office/only-office.config.js'
import { APP_STORE_REPOSITORY } from '../applications/sync/constants/store.js'
import { AuthConfigSchema, AuthTokenConfigSchema } from '../authentication/auth.config.js'
import { ACCESS_KEY, CSRF_KEY, REFRESH_KEY, WS_KEY } from '../authentication/constants/auth.js'
import { AUTH_PROVIDER, DEFAULT_STORAGE_QUOTA_FIELD } from '../authentication/providers/auth-providers.constants.js'
import { AuthProviderLDAPConfigSchema } from '../authentication/providers/ldap/auth-ldap.config.js'
import { LDAP_COMMON_ATTR, LDAP_LOGIN_ATTR } from '../authentication/providers/ldap/auth-ldap.constants.js'
import { AuthProviderOIDCConfigSchema } from '../authentication/providers/oidc/auth-oidc.config.js'
import { OAuthTokenEndpoint } from '../authentication/providers/oidc/auth-oidc.constants.js'
import { SERVER_NAME } from '../common/shared.js'
import { CacheConfigSchema } from '../infrastructure/cache/cache.config.js'
import { DB_CHARSET } from '../infrastructure/database/constants.js'
import { MailerConfigSchema } from '../infrastructure/mailer/mailer.config.js'
import { WebSocketConfigSchema } from '../infrastructure/websocket/web-socket.config.js'
import { DEFAULT_LOG_FILE_PATH } from './config.constants.js'
import { GlobalConfigSchema, LoggerConfigSchema } from './config.validation.js'

const filePaths = { dataPath: '/data', usersPath: '/data/users', spacesPath: '/data/spaces', linksPath: '/data/links' }
const ldapRequired = { servers: ['ldap://directory.example.test'], baseDN: 'dc=example,dc=test' }
const oidcRequired = { issuerUrl: 'https://identity.example.test', clientId: 'client', clientSecret: 'secret', redirectUri: '/callback' }

function tokenConfiguration() {
  return {
    access: { secret: 'access-secret' },
    refresh: { secret: 'refresh-secret' },
    csrf: { secret: 'refresh-secret' },
    ws: { secret: 'refresh-secret' }
  }
}

function minimalConfiguration() {
  return {
    mysql: { url: 'mysql://localhost/sync-in' },
    auth: { provider: AUTH_PROVIDER.MYSQL, token: tokenConfiguration() },
    applications: { files: { ...filePaths } }
  }
}

function parseAuth(overrides: Record<string, unknown> = {}) {
  return AuthConfigSchema.parse({ ...minimalConfiguration().auth, ...overrides })
}

describe('configuration contracts', () => {
  it('fills every nested default in a minimal configuration', () => {
    const config = GlobalConfigSchema.parse(minimalConfiguration())

    expect(config).toMatchObject({
      server: { host: '0.0.0.0', port: 8080, workers: 1, trustProxy: true, restartOnFailure: true },
      logger: { level: 'info', stdout: true, colorize: true, filePath: DEFAULT_LOG_FILE_PATH, jsonOutput: false },
      mysql: { url: `mysql://localhost/sync-in?charset=${DB_CHARSET}`, logQueries: false },
      cache: { adapter: 'mysql', ttl: 60, redis: 'redis://127.0.0.1:6379' },
      websocket: { adapter: 'cluster', redis: 'redis://127.0.0.1:6379' },
      auth: {
        provider: AUTH_PROVIDER.MYSQL,
        cookieSameSite: 'strict',
        mfa: { totp: { enabled: true, issuer: SERVER_NAME } },
        token: {
          access: { name: ACCESS_KEY, expiration: '15m' },
          refresh: { name: REFRESH_KEY, expiration: '4h' },
          csrf: { name: CSRF_KEY, expiration: '4h' },
          ws: { name: WS_KEY, expiration: '4h' }
        }
      },
      applications: {
        users: { showUngroupedUsers: true },
        appStore: { repository: APP_STORE_REPOSITORY.PUBLIC },
        files: {
          ...filePaths,
          maxUploadSize: 5368709120,
          contentIndexing: { enabled: true, ocr: { enabled: true, languages: ['eng'], offline: false } },
          trashRetention: { users: false, spaces: false },
          sampleDocuments: [...SAMPLE_DOCUMENT_GROUPS],
          editors: {
            onlyoffice: { enabled: false, externalServer: null, verifySSL: false },
            eurooffice: { enabled: false, externalServer: null, verifySSL: false },
            collabora: { enabled: false, externalServer: null },
            drawio: { enabled: false, externalServer: null }
          }
        }
      }
    })
    expect(config.server.publicUrl).toBeUndefined()
    expect(config.auth.ldap).toBeUndefined()
    expect(config.auth.oidc).toBeUndefined()
    expect(config.mail).toBeUndefined()
  })

  it('creates independent nested objects and arrays for each configuration', () => {
    const first = GlobalConfigSchema.parse(minimalConfiguration())
    const second = GlobalConfigSchema.parse(minimalConfiguration())
    first.applications.files.sampleDocuments.pop()
    first.applications.files.editors.onlyoffice.verifySSL = true
    first.auth.mfa.totp.enabled = false

    expect(second.applications.files.sampleDocuments).toEqual([...SAMPLE_DOCUMENT_GROUPS])
    expect(second.applications.files.editors.onlyoffice.verifySSL).toBe(false)
    expect(second.auth.mfa.totp.enabled).toBe(true)
    expect(first.applications.files.contentIndexing.ocr).not.toBe(second.applications.files.contentIndexing.ocr)

    const firstLDAP = AuthProviderLDAPConfigSchema.parse(ldapRequired)
    const secondLDAP = AuthProviderLDAPConfigSchema.parse(ldapRequired)
    const firstOIDC = AuthProviderOIDCConfigSchema.parse(oidcRequired)
    const secondOIDC = AuthProviderOIDCConfigSchema.parse(oidcRequired)
    expect(firstLDAP.attributes).not.toBe(secondLDAP.attributes)
    expect(firstLDAP.options.autoCreatePermissions).not.toBe(secondLDAP.options.autoCreatePermissions)
    expect(firstOIDC.security).not.toBe(secondOIDC.security)
    expect(firstOIDC.options.autoCreatePermissions).not.toBe(secondOIDC.options.autoCreatePermissions)
  })

  it('hydrates inactive LDAP objects without validating their fields', () => {
    const ldap = parseAuth({
      ldap: {
        servers: ['', false, 'ldap://directory.example.test', 42],
        attributes: { login: '', email: null, storageQuota: false, customAttribute: 'preserved' },
        options: { autoCreateUser: 'invalid', enablePasswordAuthFallback: undefined }
      }
    }).ldap

    expect(ldap).toMatchObject({
      servers: ['ldap://directory.example.test', 42],
      attributes: {
        login: LDAP_LOGIN_ATTR.UID,
        email: LDAP_COMMON_ATTR.MAIL,
        storageQuota: DEFAULT_STORAGE_QUOTA_FIELD,
        customAttribute: 'preserved'
      },
      options: { autoCreateUser: 'invalid', autoCreatePermissions: [] }
    })
    expect(ldap.options.enablePasswordAuthFallback).toBeUndefined()
  })

  it('hydrates inactive OIDC objects while preserving invalid and explicitly undefined values', () => {
    const oidc = parseAuth({
      oidc: {
        options: { autoCreateUser: undefined, autoRedirect: 'invalid', storageQuotaClaim: '' },
        security: { scope: 'invalid', supportPKCE: undefined, tokenEndpointAuthMethod: null }
      }
    }).oidc

    expect(oidc).toMatchObject({
      options: { autoRedirect: 'invalid', autoCreatePermissions: [], storageQuotaClaim: DEFAULT_STORAGE_QUOTA_FIELD },
      security: { scope: 'invalid', tokenEndpointAuthMethod: OAuthTokenEndpoint.ClientSecretBasic, tokenSigningAlg: 'RS256' }
    })
    expect(oidc.options.autoCreateUser).toBeUndefined()
    expect(oidc.security.supportPKCE).toBeUndefined()
  })

  it('fills omitted nested defaults of inactive LDAP and OIDC objects', () => {
    const auth = parseAuth({ ldap: {}, oidc: {} })

    expect(auth.ldap).toMatchObject({
      attributes: { login: LDAP_LOGIN_ATTR.UID, email: LDAP_COMMON_ATTR.MAIL, storageQuota: DEFAULT_STORAGE_QUOTA_FIELD },
      options: { autoCreateUser: true, autoCreatePermissions: [], enablePasswordAuthFallback: false }
    })
    expect(auth.oidc).toMatchObject({
      options: {
        autoCreateUser: true,
        autoCreatePermissions: [],
        autoRedirect: false,
        enablePasswordAuth: false,
        autoSyncAvatar: false,
        storageQuotaClaim: DEFAULT_STORAGE_QUOTA_FIELD,
        buttonText: 'Continue with OpenID Connect'
      },
      security: {
        scope: 'openid email profile',
        supportPKCE: true,
        allowInsecureRequests: false,
        tokenEndpointAuthMethod: OAuthTokenEndpoint.ClientSecretBasic,
        tokenSigningAlg: 'RS256',
        skipSubjectCheck: false,
        requireVerifiedEmail: true,
        allowPrivateIpAvatarDownload: false
      }
    })
  })

  it.each([null, undefined, false, 42, 'inactive', []].map((value) => [value]))('preserves non-object inactive providers: %s', (value) => {
    const auth = parseAuth({ ldap: value, oidc: value })
    expect(auth.ldap).toEqual(value)
    expect(auth.oidc).toEqual(value)
  })

  it.each([null, false, 42, 'inactive', []].map((value) => [value]))('preserves non-object inactive provider subsections: %s', (value) => {
    const auth = parseAuth({ ldap: { attributes: value, options: value }, oidc: { options: value, security: value } })
    expect(auth.ldap.attributes).toEqual(value)
    expect(auth.ldap.options).toEqual(value)
    expect(auth.oidc.options).toEqual(value)
    expect(auth.oidc.security).toEqual(value)
  })

  it.each([
    [AUTH_PROVIDER.LDAP, { ldap: { ...ldapRequired, options: { autoCreateUser: 'invalid' } } }],
    [AUTH_PROVIDER.LDAP, { ldap: { ...ldapRequired, servers: ['ldap://directory.example.test', 42] } }],
    [AUTH_PROVIDER.OIDC, { oidc: { ...oidcRequired, options: { autoRedirect: 'invalid' } } }],
    [AUTH_PROVIDER.OIDC, { oidc: { ...oidcRequired, security: { scope: 'invalid' } } }]
  ])('validates the active %s provider', (provider, overrides) => {
    expect(AuthConfigSchema.safeParse({ ...minimalConfiguration().auth, provider, ...overrides }).success).toBe(false)
  })

  it('hydrates OCR permissively when content indexing is disabled', () => {
    expect(FilesContentIndexingConfigSchema.parse({ enabled: false, ocr: { languages: 42, offline: undefined } }).ocr).toMatchObject({
      enabled: true,
      languages: 42
    })
    expect(FilesContentIndexingConfigSchema.parse({ enabled: false, ocr: { offline: undefined } }).ocr).toMatchObject({ offline: undefined })
    expect(FilesContentIndexingConfigSchema.parse({ enabled: false }).ocr).toMatchObject({ enabled: true, languages: ['eng'], offline: false })
    expect(FilesContentIndexingConfigSchema.safeParse({ enabled: true, ocr: { languages: 42 } }).success).toBe(false)
  })

  it.each([null, false, 42, 'inactive', []].map((value) => [value]))('preserves non-object OCR when content indexing is disabled: %s', (ocr) => {
    expect(FilesContentIndexingConfigSchema.parse({ enabled: false, ocr }).ocr).toEqual(ocr)
  })

  it('keeps inactive cache, websocket, OCR and editor fields permissive', () => {
    expect(CacheConfigSchema.parse({ adapter: 'mysql', redis: null }).redis).toBeNull()
    expect(WebSocketConfigSchema.parse({ adapter: 'cluster', redis: 42 }).redis).toBe(42)
    expect(FilesContentIndexingConfigSchema.parse({ enabled: true, ocr: { enabled: false, languages: 42 } }).ocr).toMatchObject({ languages: 42 })
    expect(OnlyOfficeConfigSchema.parse({ enabled: false, secret: 42 }).secret).toBe(42)
    expect(CacheConfigSchema.safeParse({ adapter: 'redis', redis: null }).success).toBe(false)
    expect(WebSocketConfigSchema.safeParse({ adapter: 'redis', redis: 42 }).success).toBe(false)
    expect(OnlyOfficeConfigSchema.safeParse({ enabled: true, secret: 42 }).success).toBe(false)
    expect(OnlyOfficeConfigSchema.safeParse({ enabled: false, externalServer: 'invalid' }).success).toBe(false)
  })

  it('preserves explicit nullish settings instead of replacing them with defaults', () => {
    expect(LoggerConfigSchema.parse({ jsonOutput: null }).jsonOutput).toBeNull()
    expect(parseAuth({ encryptionKey: null }).encryptionKey).toBeNull()
    expect(AuthProviderLDAPConfigSchema.parse({ ...ldapRequired, tlsOptions: null, options: { autoCreateUser: null } })).toMatchObject({
      tlsOptions: null,
      options: { autoCreateUser: null }
    })
    expect(
      AuthProviderOIDCConfigSchema.parse({ ...oidcRequired, options: { autoCreatePermissions: null }, security: { supportPKCE: null } })
    ).toMatchObject({
      options: { autoCreatePermissions: null },
      security: { supportPKCE: null }
    })
    expect(MailerConfigSchema.parse({ host: 'smtp.example.test', secure: null, auth: null, sender: null, logger: null })).toMatchObject({
      port: 25,
      secure: null,
      ignoreTLS: false,
      rejectUnauthorized: true,
      auth: null,
      sender: null,
      logger: null
    })
  })

  it('preserves unknown properties at every validated nesting level', () => {
    const input = minimalConfiguration()
    const config = GlobalConfigSchema.parse({
      ...input,
      customRoot: 'root',
      server: { customServer: 'server' },
      auth: { ...input.auth, customAuth: 'auth', token: { ...input.auth.token, access: { secret: 'access-secret', customToken: 'token' } } },
      applications: { files: { ...filePaths, contentIndexing: { customIndexing: 'indexing', ocr: { customOCR: 'ocr' } } } }
    })
    expect(config).toMatchObject({
      customRoot: 'root',
      server: { customServer: 'server' },
      auth: { customAuth: 'auth', token: { access: { customToken: 'token' } } },
      applications: { files: { contentIndexing: { customIndexing: 'indexing', ocr: { customOCR: 'ocr' } } } }
    })
  })

  it.each([undefined, null, 'custom-token', 42])('enforces server-controlled token names for %s', (name) => {
    const tokens = Object.fromEntries(Object.entries(tokenConfiguration()).map(([key, value]) => [key, { ...value, name }]))
    expect(AuthTokenConfigSchema.parse(tokens)).toMatchObject({
      access: { name: ACCESS_KEY },
      refresh: { name: REFRESH_KEY },
      csrf: { name: CSRF_KEY },
      ws: { name: WS_KEY }
    })
  })

  it.each([undefined, null, false, 42, 'derived-token', { custom: true }])('preserves unchecked derived tokens: %s', (value) => {
    const tokens = AuthTokenConfigSchema.parse({ ...tokenConfiguration(), access_2fa: value, csrf_2fa: value })

    expect(tokens.access_2fa).toBe(value)
    expect(tokens.csrf_2fa).toBe(value)
  })
})
