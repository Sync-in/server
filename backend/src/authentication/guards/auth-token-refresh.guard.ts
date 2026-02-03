import { ExecutionContext, Injectable, Logger } from '@nestjs/common'
import { AuthGuard, IAuthGuard } from '@nestjs/passport'

@Injectable()
export class AuthTokenRefreshGuard extends AuthGuard('tokenRefresh') implements IAuthGuard {
  private readonly logger = new Logger(AuthTokenRefreshGuard.name)

  handleRequest(err: any, user: any, info: Error, ctx: ExecutionContext, status?: any) {
    const req = this.getRequest(ctx)
    req.raw.user = user?.login || 'unauthorized'
    if (info) {
      this.logger.warn(`<${req.raw.user}> <${req.ip}> ${info}`)
    }
    return super.handleRequest(err, user, info, ctx, status)
  }
}
