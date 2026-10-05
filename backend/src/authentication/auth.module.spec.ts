import { AUTH_PROVIDER } from './providers/auth-providers.constants'

const lazyLoads = {
  mysql: vi.fn(),
  ldap: vi.fn(),
  oidc: vi.fn(),
  oidcController: vi.fn()
}

describe('AuthModule', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.doMock('./providers/mysql/auth-provider-mysql.service', () => {
      lazyLoads.mysql()
      return { AuthProviderMySQL: class AuthProviderMySQL {} }
    })
    vi.doMock('./providers/ldap/auth-provider-ldap.service', () => {
      lazyLoads.ldap()
      return { AuthProviderLDAP: class AuthProviderLDAP {} }
    })
    vi.doMock('./providers/oidc/auth-provider-oidc.service', () => {
      lazyLoads.oidc()
      return { AuthProviderOIDC: class AuthProviderOIDC {} }
    })
    vi.doMock('./providers/oidc/auth-oidc.controller', () => {
      lazyLoads.oidcController()
      return { AuthOIDCController: class AuthOIDCController {} }
    })
  })

  afterEach(() => {
    vi.doUnmock('./providers/mysql/auth-provider-mysql.service')
    vi.doUnmock('./providers/ldap/auth-provider-ldap.service')
    vi.doUnmock('./providers/oidc/auth-provider-oidc.service')
    vi.doUnmock('./providers/oidc/auth-oidc.controller')
  })

  it.each([
    { provider: AUTH_PROVIDER.MYSQL, providerName: 'AuthProviderMySQL', hasOIDCController: false },
    { provider: AUTH_PROVIDER.LDAP, providerName: 'AuthProviderLDAP', hasOIDCController: false },
    { provider: AUTH_PROVIDER.OIDC, providerName: 'AuthProviderOIDC', hasOIDCController: true }
  ])('should only load the $provider provider', async ({ provider, providerName, hasOIDCController }) => {
    const { AuthModule } = await import('./auth.module')
    const { AuthProvider } = await import('./providers/auth-providers.models')
    const definition = await AuthModule.register(provider)
    const selectedProvider = definition.providers?.find((candidate) => typeof candidate === 'function' && candidate.name === providerName)
    const controllerNames = definition.controllers?.map((controller) => controller.name) ?? []

    expect(selectedProvider).toBeDefined()
    expect(definition.providers).toContainEqual({ provide: AuthProvider, useExisting: selectedProvider })
    expect(controllerNames.includes('AuthOIDCController')).toBe(hasOIDCController)
    expect(lazyLoads.mysql).toHaveBeenCalledTimes(provider === AUTH_PROVIDER.MYSQL ? 1 : 0)
    expect(lazyLoads.ldap).toHaveBeenCalledTimes(provider === AUTH_PROVIDER.LDAP ? 1 : 0)
    expect(lazyLoads.oidc).toHaveBeenCalledTimes(provider === AUTH_PROVIDER.OIDC ? 1 : 0)
    expect(lazyLoads.oidcController).toHaveBeenCalledTimes(hasOIDCController ? 1 : 0)
  })

  it('should fall back to MySQL for an unexpected provider', async () => {
    const { AuthModule } = await import('./auth.module')
    const definition = await AuthModule.register('unexpected' as AUTH_PROVIDER)

    expect(definition.providers?.some((candidate) => typeof candidate === 'function' && candidate.name === 'AuthProviderMySQL')).toBe(true)
    expect(lazyLoads.mysql).toHaveBeenCalledOnce()
    expect(lazyLoads.ldap).not.toHaveBeenCalled()
    expect(lazyLoads.oidc).not.toHaveBeenCalled()
    expect(lazyLoads.oidcController).not.toHaveBeenCalled()
  })
})
