import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { CONNECT_ERROR_CODE } from '../../../app.constants'
import { UserModel } from '../../../applications/users/models/user.model'
import { UsersManager } from '../../../applications/users/services/users-manager.service'
import { AUTH_SCOPE } from '../../constants/scope'
import { AuthProvider } from '../auth-providers.models'

@Injectable()
export class AuthProviderMySQL implements AuthProvider {
  private readonly logger = new Logger(AuthProviderMySQL.name)

  constructor(private readonly usersManager: UsersManager) {}

  async validateUser(loginOrEmail: string, password: string, ip?: string, scope?: AUTH_SCOPE): Promise<UserModel> {
    try {
      return await this.usersManager.validateLocalPasswordByLogin(loginOrEmail, password, ip, scope)
    } catch (e) {
      if (e instanceof HttpException) {
        throw e
      }
      this.logger.error({ tag: this.validateUser.name, msg: `${e}` })
      throw new HttpException(
        CONNECT_ERROR_CODE.has(e.cause?.code) ? 'Authentication service error' : e.cause?.code || e.message,
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
