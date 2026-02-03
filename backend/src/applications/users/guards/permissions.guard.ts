import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { FastifyAuthenticatedRequest } from '../../../authentication/interfaces/auth-request.interface'
import { USER_PERMISSION } from '../constants/user'
import { UserHavePermission } from '../decorators/permissions.decorator'

@Injectable()
export class UserPermissionsGuard implements CanActivate {
  private readonly logger = new Logger(UserPermissionsGuard.name)

  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const permissions: USER_PERMISSION | USER_PERMISSION[] = this.reflector.getAllAndOverride(UserHavePermission, [ctx.getHandler(), ctx.getClass()])
    if (permissions === undefined) {
      this.logger.warn(`no application defined on ${ctx.getClass().name}:${ctx.getHandler().name}`)
      return false
    }
    if (Object.keys(permissions).length === 0) {
      // used to bypass the check, the guard is called without argument, the value is '{}'
      return true
    }
    const req: FastifyAuthenticatedRequest = ctx.switchToHttp().getRequest()
    if (req.user.isAdmin) {
      return true
    }
    let authorized = false
    if (Array.isArray(permissions)) {
      // if any of the apps are allowed, proceed
      authorized = permissions.some((p: string) => req.user.havePermission(p))
    } else {
      authorized = req.user.havePermission(permissions)
    }
    if (!authorized) {
      this.logger.warn(`does not have permissions : ${permissions}`)
      throw new HttpException('You are not allowed to do this action', HttpStatus.FORBIDDEN)
    }
    return authorized
  }
}
