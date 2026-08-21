import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, mixin, Type } from '@nestjs/common'
import { UserModel } from '../../../../applications/users/models/user.model'
import { configuration } from '../../../../configuration/config.environment'
import { TWO_FA_HEADER_CODE, TWO_FA_HEADER_PASSWORD } from '../../../constants/auth'
import { FastifyAuthenticatedRequest } from '../../../interfaces/auth-request.interface'
import { AUTH_SESSION } from '../../auth-providers.constants'
import { AuthProvider2FA } from '../auth-provider-two-fa.service'

export const AuthTwoFaVerificationGuard = AuthTwoFaVerificationGuardFactory()
export const AuthTwoFaVerificationWithoutPasswordGuard = AuthTwoFaVerificationGuardFactory({ withPassword: false })
export const AuthTwoFaVerificationOrPasswordGuard = AuthTwoFaVerificationGuardFactory({
  passwordFallback: true,
  skipStepUpForOidcOnlyUser: true,
  withPassword: false
})

interface TwoFaVerificationGuardOptions {
  passwordFallback?: boolean
  skipStepUpForOidcOnlyUser?: boolean
  withPassword?: boolean
}

function AuthTwoFaVerificationGuardFactory(options: TwoFaVerificationGuardOptions = { withPassword: true }): Type<CanActivate> {
  @Injectable()
  class MixinAuthTwoFaVerificationGuard implements CanActivate {
    constructor(private readonly authProvider2FA: AuthProvider2FA) {}

    async canActivate(ctx: ExecutionContext): Promise<boolean> {
      const req: FastifyAuthenticatedRequest = ctx.switchToHttp().getRequest()
      const user = await this.authProvider2FA.loadUser(req.user.id, req.ip)
      const twoFaEnabled = configuration.auth.mfa.totp.enabled && user.twoFaEnabled
      const passwordFallbackRequired = options.passwordFallback && !twoFaEnabled

      if (options.skipStepUpForOidcOnlyUser && canSkipStepUpForOidcOnlyUser(req.user, user)) {
        return true
      }

      if (options.withPassword || passwordFallbackRequired) {
        if (!req.headers[TWO_FA_HEADER_PASSWORD]) {
          throw new HttpException('Missing TWO-FA password', HttpStatus.FORBIDDEN)
        }
        await this.authProvider2FA.verifyUserPassword(user, req.headers[TWO_FA_HEADER_PASSWORD] as string, req.ip)
      }

      if (!twoFaEnabled) {
        return true
      }

      if (!req.headers[TWO_FA_HEADER_CODE]) {
        throw new HttpException('Missing TWO-FA code', HttpStatus.FORBIDDEN)
      }

      const auth = await this.authProvider2FA.verify({ code: req.headers[TWO_FA_HEADER_CODE] as string }, req)

      if (!auth.success) {
        throw new HttpException(auth.message, HttpStatus.FORBIDDEN)
      }

      return true
    }
  }

  return mixin(MixinAuthTwoFaVerificationGuard)
}

function canSkipStepUpForOidcOnlyUser(authUser: UserModel, user: UserModel): boolean {
  return authUser.authSession === AUTH_SESSION.OIDC && user.isUser && !user.isAdmin
}
