import { Injectable } from '@nestjs/common'
import { AbstractStrategy, PassportStrategy } from '@nestjs/passport'
import { ThrottlerException } from '@nestjs/throttler'
import { instanceToPlain, plainToInstance } from 'class-transformer'
import { FastifyRequest } from 'fastify'
import { PinoLogger } from 'nestjs-pino'
import { UserModel } from '../../applications/users/models/user.model.js'
import { convertHumanTimeToSeconds } from '../../common/functions.js'
import { SERVER_NAME } from '../../common/shared.js'
import { configuration } from '../../configuration/config.environment.js'
import { Cache } from '../../infrastructure/cache/cache.service.js'
import { AUTH_RATE_LIMIT_ERROR_MESSAGE } from '../constants/auth.js'
import { AUTH_SCOPE } from '../constants/scope.js'
import { AuthPasswordWorkLimitException } from '../errors/auth-password-work-limit.exception.js'
import { AuthProvider } from '../providers/auth-providers.models.js'
import { genWebDAVAuthCacheKey } from '../utils/auth-cache.js'
import { consumeWebDAVRateLimit } from '../utils/auth-rate-limit.js'
import { HttpBasicStrategy } from './implementations/http-basic.strategy.js'

@Injectable()
export class AuthBasicStrategy extends PassportStrategy(HttpBasicStrategy, 'basic') implements AbstractStrategy {
  private static readonly cacheAuthWebDAVTTL = convertHumanTimeToSeconds(configuration.auth.token.access.expiration)

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
    const basicAuthCacheKey = genWebDAVAuthCacheKey(loginOrEmail, password, configuration.auth.token.access.secret)
    const userFromCache: null | undefined | Partial<UserModel> = await this.cache.get(basicAuthCacheKey)
    if (userFromCache) {
      // Only successful credentials are usable from cache; ignore any stale negative entry.
      // Warning: plainToInstance do not use constructor to instantiate the class
      return plainToInstance(UserModel, userFromCache)
    }

    // Every WebDAV request is authenticated: only rate limit credentials that still require an actual provider lookup.
    // Track by IP across all logins to also prevent password-spraying attempts.
    const rateLimit = await consumeWebDAVRateLimit(this.cache, req.ip)
    if (rateLimit.isBlocked) {
      throw new ThrottlerException(AUTH_RATE_LIMIT_ERROR_MESSAGE)
    }

    let userFromDB: UserModel
    try {
      userFromDB = await this.authProvider.validateUser(loginOrEmail, password, req.ip, AUTH_SCOPE.WEBDAV)
    } catch (e) {
      // Keep the Basic 401 challenge when the shared work limit rejects a request.
      if (e instanceof AuthPasswordWorkLimitException) return null
      throw e
    }
    // Do not cache any denial: a lock can lift, and caching only other denials would create a timing oracle.
    if (userFromDB === null) return null

    userFromDB.removePassword()
    const userToCache: Record<string, any> = instanceToPlain(userFromDB, { excludePrefixes: ['_'] })
    this.cache
      .set(basicAuthCacheKey, userToCache, AuthBasicStrategy.cacheAuthWebDAVTTL)
      .catch((e: Error) => this.logger.error({ tag: this.validate.name, msg: `${e}` }))
    return userFromDB
  }
}
