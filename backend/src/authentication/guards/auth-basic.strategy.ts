import { Injectable } from '@nestjs/common'
import { AbstractStrategy, PassportStrategy } from '@nestjs/passport'
import { instanceToPlain, plainToInstance } from 'class-transformer'
import { FastifyRequest } from 'fastify'
import { PinoLogger } from 'nestjs-pino'
import { UserModel } from '../../applications/users/models/user.model'
import { SERVER_NAME } from '../../common/shared'
import { Cache } from '../../infrastructure/cache/services/cache.service'
import { AUTH_SCOPE } from '../constants/scope'
import { AuthProvider } from '../providers/auth-providers.models'
import { HttpBasicStrategy } from './implementations/http-basic.strategy'

@Injectable()
export class AuthBasicStrategy extends PassportStrategy(HttpBasicStrategy, 'basic') implements AbstractStrategy {
  private readonly CACHE_TTL = 900
  private readonly CACHE_KEY_PREFIX = 'auth-webdav'

  constructor(
    private readonly authProvider: AuthProvider,
    private readonly cache: Cache,
    private readonly logger: PinoLogger
  ) {
    super({ passReqToCallback: true, realm: SERVER_NAME })
  }

  async validate(req: FastifyRequest, loginOrEmail: string, password: string): Promise<Omit<UserModel, 'password'> | null> {
    loginOrEmail = loginOrEmail.trim()
    password = password.trim()
    this.logger.assign({ user: loginOrEmail })
    const authBasicUser = `${this.CACHE_KEY_PREFIX}-${req.headers['authorization'].split(' ').at(-1).toLowerCase()}`
    const userFromCache: any = await this.cache.get(authBasicUser)
    if (userFromCache === null) {
      // not authorized
      return null
    }
    if (userFromCache !== undefined) {
      // cached
      // warning: plainToInstance do not use constructor to instantiate the class
      return plainToInstance(UserModel, userFromCache)
    }
    const userFromDB: UserModel = await this.authProvider.validateUser(loginOrEmail, password, req.ip, AUTH_SCOPE.WEBDAV)
    if (userFromDB !== null) {
      userFromDB.removePassword()
    }
    const userToCache: Record<string, any> | null = userFromDB ? instanceToPlain(userFromDB, { excludePrefixes: ['_'] }) : null
    this.cache.set(authBasicUser, userToCache, this.CACHE_TTL).catch((e: Error) => this.logger.error({ tag: this.validate.name, msg: `${e}` }))
    return userFromDB
  }
}
