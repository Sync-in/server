import type { AuthProviderDefinition } from '../interfaces/auth-provider-definition.interface'
import { AUTH_PROVIDER } from './auth-providers.constants'

export async function loadAuthProviderDefinition(provider: AUTH_PROVIDER): Promise<AuthProviderDefinition> {
  switch (provider) {
    case AUTH_PROVIDER.LDAP:
      return {
        provider: (await import('./ldap/auth-provider-ldap.service.js')).AuthProviderLDAP,
        controllers: []
      }

    case AUTH_PROVIDER.OIDC: {
      const [{ AuthProviderOIDC }, { AuthOIDCController }] = await Promise.all([
        import('./oidc/auth-provider-oidc.service.js'),
        import('./oidc/auth-oidc.controller.js')
      ])

      return {
        provider: AuthProviderOIDC,
        controllers: [AuthOIDCController]
      }
    }

    case AUTH_PROVIDER.MYSQL:
    default:
      return {
        provider: (await import('./mysql/auth-provider-mysql.service.js')).AuthProviderMySQL,
        controllers: []
      }
  }
}
