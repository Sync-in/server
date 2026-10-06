import { type DynamicModule, Global, Module, type Provider } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { ThrottlerModule } from '@nestjs/throttler'
import { UsersModule } from '../applications/users/users.module.js'
import { CacheModule } from '../infrastructure/cache/cache.module.js'
import { Cache } from '../infrastructure/cache/cache.service.js'
import { AuthRateLimitStorage } from './adapters/auth-rate-limit-storage.adapter.js'
import { AuthController } from './auth.controller.js'
import { AuthManager } from './auth.service.js'
import { AUTH_RATE_LIMIT_OPTIONS } from './constants/auth.js'
import { AuthAnonymousGuard } from './guards/auth-anonymous.guard.js'
import { AuthAnonymousStrategy } from './guards/auth-anonymous.strategy.js'
import { AuthBasicGuard } from './guards/auth-basic.guard.js'
import { AuthBasicStrategy } from './guards/auth-basic.strategy.js'
import { AuthLocalGuard } from './guards/auth-local.guard.js'
import { AuthLocalStrategy } from './guards/auth-local.strategy.js'
import { AuthRateLimitGuard } from './guards/auth-rate-limit.guard.js'
import { AuthTokenAccessGuard } from './guards/auth-token-access.guard.js'
import { AuthTokenAccessStrategy } from './guards/auth-token-access.strategy.js'
import { AuthTokenRefreshGuard } from './guards/auth-token-refresh.guard.js'
import { AuthTokenRefreshStrategy } from './guards/auth-token-refresh.strategy.js'
import type { AUTH_PROVIDER } from './providers/auth-providers.constants.js'
import { AuthProvider } from './providers/auth-providers.models.js'
import { loadAuthProviderDefinition } from './providers/auth-providers.js'
import { AuthProvider2FA } from './providers/two-fa/auth-provider-two-fa.service.js'
import { AuthTokenTwoFaGuard } from './providers/two-fa/guards/auth-token-two-fa.guard.js'
import { AuthTokenTwoFaStrategy } from './providers/two-fa/guards/auth-token-two-fa.strategy.js'

@Global()
@Module({})
export class AuthModule {
  static async register(provider: AUTH_PROVIDER): Promise<DynamicModule> {
    const { provider: authProvider, controllers: providerControllers } = await loadAuthProviderDefinition(provider)
    const providers: Provider[] = [
      {
        provide: APP_GUARD,
        useClass: AuthTokenAccessGuard
      },
      AuthRateLimitGuard,
      AuthTokenRefreshGuard,
      AuthTokenTwoFaGuard,
      AuthLocalGuard,
      AuthBasicGuard,
      AuthAnonymousGuard,
      AuthLocalStrategy,
      AuthTokenAccessStrategy,
      AuthTokenRefreshStrategy,
      AuthTokenTwoFaStrategy,
      AuthBasicStrategy,
      AuthAnonymousStrategy,
      AuthManager,
      AuthProvider2FA,
      // AuthOIDCController requires the concrete token; generic consumers reuse the same instance through AuthProvider.
      authProvider,
      { provide: AuthProvider, useExisting: authProvider }
    ]

    return {
      module: AuthModule,
      imports: [
        JwtModule.register({ global: true }),
        ThrottlerModule.forRootAsync({
          imports: [CacheModule],
          inject: [Cache],
          useFactory: (cache: Cache) => ({
            throttlers: [AUTH_RATE_LIMIT_OPTIONS],
            storage: new AuthRateLimitStorage(cache)
          })
        }),
        UsersModule,
        PassportModule
      ],
      controllers: [AuthController, ...providerControllers],
      providers,
      exports: [AuthManager, AuthProvider, AuthProvider2FA, AuthRateLimitGuard]
    }
  }
}
