import { BadRequestException, ExecutionContext, Injectable, Logger } from '@nestjs/common'
import { AuthGuard, IAuthGuard } from '@nestjs/passport'

@Injectable()
export class AuthLocalGuard extends AuthGuard('local') implements IAuthGuard {
  private readonly logger = new Logger(AuthLocalGuard.name)

  canActivate(ctx: ExecutionContext) {
    const { query } = this.getRequest(ctx)

    // Passport Local falls back to query parameters when body credentials are missing.
    if (Object.hasOwn(query ?? {}, 'login') || Object.hasOwn(query ?? {}, 'password')) {
      throw new BadRequestException('Credentials must not be provided in query parameters')
    }

    return super.canActivate(ctx)
  }

  handleRequest<TUser = any>(err: any, user: any, info: Error, ctx: ExecutionContext, status?: any): TUser {
    const req = this.getRequest(ctx)
    req.raw.user = user?.login || 'unauthorized'
    if (info) {
      this.logger.warn(`<${req.raw.user}> <${req.ip}> ${info}`)
    }
    return super.handleRequest(err, user, info, ctx, status)
  }
}
