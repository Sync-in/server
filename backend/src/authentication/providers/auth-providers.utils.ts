/*
 * Copyright (C) 2012-2026 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Provider } from '@nestjs/common'
import { AUTH_PROVIDER } from './auth-providers.constants'

import { AuthProvider } from './auth-providers.models'
import { AuthProviderLDAP } from './ldap/auth-provider-ldap.service'
import { AuthProviderMySQL } from './mysql/auth-provider-mysql.service'
import { AuthProviderOIDC } from './oidc/auth-provider-oidc.service'

export function selectAuthProvider(provider: AUTH_PROVIDER): Provider {
  switch (provider) {
    case AUTH_PROVIDER.OIDC:
      // `AuthProviderOIDC` is already provided by `AuthProviderOIDCModule`
      return { provide: AuthProvider, useExisting: AuthProviderOIDC }

    case AUTH_PROVIDER.LDAP:
      return { provide: AuthProvider, useClass: AuthProviderLDAP }

    case AUTH_PROVIDER.MYSQL:
      return { provide: AuthProvider, useClass: AuthProviderMySQL }

    default:
      return { provide: AuthProvider, useClass: AuthProviderMySQL }
  }
}
