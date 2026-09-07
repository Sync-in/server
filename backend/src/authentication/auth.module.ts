import { Global, Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { ThrottlerModule } from '@nestjs/throttler'
import { UsersModule } from '../applications/users/users.module'
import { configuration } from '../configuration/config.environment'
import { CacheModule } from '../infrastructure/cache/cache.module'
import { Cache } from '../infrastructure/cache/cache.service'
import { AuthRateLimitStorage } from './adapters/auth-rate-limit-storage.adapter'
import { AuthController } from './auth.controller'
import { AuthManager } from './auth.service'
import { AUTH_RATE_LIMIT_OPTIONS } from './constants/auth'
import { AuthAnonymousGuard } from './guards/auth-anonymous.guard'
import { AuthAnonymousStrategy } from './guards/auth-anonymous.strategy'
import { AuthBasicGuard } from './guards/auth-basic.guard'
import { AuthBasicStrategy } from './guards/auth-basic.strategy'
import { AuthLocalGuard } from './guards/auth-local.guard'
import { AuthLocalStrategy } from './guards/auth-local.strategy'
import { AuthRateLimitGuard } from './guards/auth-rate-limit.guard'
import { AuthTokenAccessGuard } from './guards/auth-token-access.guard'
import { AuthTokenAccessStrategy } from './guards/auth-token-access.strategy'
import { AuthTokenRefreshGuard } from './guards/auth-token-refresh.guard'
import { AuthTokenRefreshStrategy } from './guards/auth-token-refresh.strategy'
import { AUTH_PROVIDER } from './providers/auth-providers.constants'
import { AuthProvider } from './providers/auth-providers.models'
import { selectAuthProvider } from './providers/auth-providers'
import { AuthProviderOIDCModule } from './providers/oidc/auth-provider-oidc.module'
import { AuthProvider2FA } from './providers/two-fa/auth-provider-two-fa.service'
import { AuthTokenTwoFaGuard } from './providers/two-fa/guards/auth-token-two-fa.guard'
import { AuthTokenTwoFaStrategy } from './providers/two-fa/guards/auth-token-two-fa.strategy'

@Global()
@Module({
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
    PassportModule,
    ...(configuration.auth.provider === AUTH_PROVIDER.OIDC ? [AuthProviderOIDCModule] : [])
  ],
  controllers: [AuthController],
  providers: [
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
    selectAuthProvider(configuration.auth.provider)
  ],
  exports: [AuthManager, AuthProvider, AuthProvider2FA, AuthRateLimitGuard]
})
export class AuthModule {}
