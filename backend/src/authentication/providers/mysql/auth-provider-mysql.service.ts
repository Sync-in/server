import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { CONNECT_ERROR_CODE } from '../../../app.constants.js'
import { UserModel } from '../../../applications/users/models/user.model.js'
import { UsersManager } from '../../../applications/users/services/users-manager.service.js'
import { toErrorMessage } from '../../../common/errors.js'
import { AUTH_SCOPE } from '../../constants/scope.js'
import { AuthProvider } from '../auth-providers.models.js'

@Injectable()
export class AuthProviderMySQL implements AuthProvider {
  private readonly logger = new Logger(AuthProviderMySQL.name)

  constructor(private readonly usersManager: UsersManager) {}

  async validateUser(loginOrEmail: string, password: string, ip?: string, scope?: AUTH_SCOPE): Promise<UserModel | null> {
    try {
      return await this.usersManager.validateLocalPasswordByLogin(loginOrEmail, password, ip, scope)
    } catch (e) {
      if (e instanceof HttpException) {
        throw e
      }
      this.logger.error({ tag: this.validateUser.name, msg: toErrorMessage(e) })
      const causeCode =
        e instanceof Error && e.cause !== null && typeof e.cause === 'object' && 'code' in e.cause && typeof e.cause.code === 'string'
          ? e.cause.code
          : undefined
      throw new HttpException(
        causeCode && CONNECT_ERROR_CODE.has(causeCode) ? 'Authentication service error' : causeCode || toErrorMessage(e),
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
