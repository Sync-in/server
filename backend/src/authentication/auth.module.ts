/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Global, Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { UsersModule } from '../applications/users/users.module'
import { configuration } from '../configuration/config.environment'
import { AuthController } from './auth.controller'
import { AuthAnonymousGuard } from './guards/auth-anonymous.guard'
import { AuthAnonymousStrategy } from './guards/auth-anonymous.strategy'
import { AuthBasicGuard } from './guards/auth-basic.guard'
import { AuthBasicStrategy } from './guards/auth-basic.strategy'
import { AuthLocalGuard } from './guards/auth-local.guard'
import { AuthLocalStrategy } from './guards/auth-local.strategy'
import { AuthTokenAccessGuard } from './guards/auth-token-access.guard'
import { AuthTokenAccessStrategy } from './guards/auth-token-access.strategy'
import { AuthTokenRefreshGuard } from './guards/auth-token-refresh.guard'
import { AuthTokenRefreshStrategy } from './guards/auth-token-refresh.strategy'
import { AuthTwoFaGuard } from './guards/auth-two-fa-guard'
import { AuthMethod } from './models/auth-method'
import { AuthManager } from './services/auth-manager.service'
import { AuthMethodDatabase } from './services/auth-methods/auth-method-database.service'
import { AuthMethodLdapService } from './services/auth-methods/auth-method-ldap.service'
import { AuthMethod2FA } from './services/auth-methods/auth-method-two-fa.service'

@Global()
@Module({
  imports: [JwtModule.register({ global: true }), UsersModule, PassportModule],
  controllers: [AuthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AuthTokenAccessGuard
    },
    AuthTokenRefreshGuard,
    AuthLocalGuard,
    AuthBasicGuard,
    AuthAnonymousGuard,
    AuthLocalStrategy,
    AuthTokenAccessStrategy,
    AuthTokenRefreshStrategy,
    AuthBasicStrategy,
    AuthAnonymousStrategy,
    AuthManager,
    AuthMethod2FA,
    AuthTwoFaGuard,
    { provide: AuthMethod, useClass: configuration.auth.method === 'ldap' ? AuthMethodLdapService : AuthMethodDatabase }
  ],
  exports: [AuthManager, AuthMethod, AuthMethod2FA, AuthTwoFaGuard]
})
export class AuthModule {}
