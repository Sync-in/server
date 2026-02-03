import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import type { JwtIdentityPayload } from '../../../authentication/interfaces/jwt-payload.interface'

export const GetWsUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): JwtIdentityPayload => {
  return ctx.switchToWs().getClient().user
})
