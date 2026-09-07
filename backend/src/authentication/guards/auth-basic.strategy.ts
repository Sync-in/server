import { Injectable } from '@nestjs/common'
import { AbstractStrategy, PassportStrategy } from '@nestjs/passport'
import { ThrottlerException } from '@nestjs/throttler'
import { instanceToPlain, plainToInstance } from 'class-transformer'
import { FastifyRequest } from 'fastify'
import { PinoLogger } from 'nestjs-pino'
import { genHash } from '../../applications/files/utils/files'
import { UserModel } from '../../applications/users/models/user.model'
import { SERVER_NAME } from '../../common/shared'
import { Cache } from '../../infrastructure/cache/cache.service'
import { AUTH_RATE_LIMIT_ERROR_MESSAGE, AUTH_WEBDAV_RATE_LIMIT_OPTIONS } from '../constants/auth'
import { CACHE_AUTH_RATE_LIMIT_PREFIX, CACHE_AUTH_WEBDAV_PREFIX, CACHE_AUTH_WEBDAV_TTL } from '../constants/cache'
import { AUTH_SCOPE } from '../constants/scope'
import { AuthProvider } from '../providers/auth-providers.models'
import { HttpBasicStrategy } from './implementations/http-basic.strategy'

@Injectable()
export class AuthBasicStrategy extends PassportStrategy(HttpBasicStrategy, 'basic') implements AbstractStrategy {
  constructor(
    private readonly authProvider: AuthProvider,
    private readonly cache: Cache,
    private readonly logger: PinoLogger
  ) {
    super({ passReqToCallback: true, realm: SERVER_NAME })
  }

  async validate(req: FastifyRequest, loginOrEmail: string, password: string): Promise<Omit<UserModel, 'password'> | null> {
    loginOrEmail = loginOrEmail.trim()
    this.logger.assign({ user: loginOrEmail })
    const basicAuthCacheKey = `${CACHE_AUTH_WEBDAV_PREFIX}-${genHash(`${loginOrEmail}\u0000${password}`, 'sha256')}`
    const userFromCache: null | undefined | Partial<UserModel> = await this.cache.get(basicAuthCacheKey)
    if (userFromCache === null) {
      // These credentials were already rejected, so avoid another provider lookup.
      return null
    }
    if (userFromCache !== undefined) {
      // cached
      // warning: plainToInstance do not use constructor to instantiate the class
      return plainToInstance(UserModel, userFromCache)
    }

    // Every WebDAV request is authenticated: only rate limit credentials that still require an actual provider lookup.
    // Track by IP across all logins to also prevent password-spraying attempts.
    const rateLimitTracker = genHash(req.ip, 'sha256')
    const rateLimit = await this.cache.consumeRateLimit(
      `${CACHE_AUTH_RATE_LIMIT_PREFIX}-webdav-${rateLimitTracker}`,
      AUTH_WEBDAV_RATE_LIMIT_OPTIONS.ttl,
      AUTH_WEBDAV_RATE_LIMIT_OPTIONS.limit,
      AUTH_WEBDAV_RATE_LIMIT_OPTIONS.blockDuration
    )
    if (rateLimit.isBlocked) {
      throw new ThrottlerException(AUTH_RATE_LIMIT_ERROR_MESSAGE)
    }

    const userFromDB: UserModel = await this.authProvider.validateUser(loginOrEmail, password, req.ip, AUTH_SCOPE.WEBDAV)
    if (userFromDB !== null) {
      userFromDB.removePassword()
    }
    const userToCache: Record<string, any> | null = userFromDB ? instanceToPlain(userFromDB, { excludePrefixes: ['_'] }) : null
    this.cache
      .set(basicAuthCacheKey, userToCache, CACHE_AUTH_WEBDAV_TTL)
      .catch((e: Error) => this.logger.error({ tag: this.validate.name, msg: `${e}` }))
    return userFromDB
  }
}
