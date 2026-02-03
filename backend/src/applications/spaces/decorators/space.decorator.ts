import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { SpaceEnv } from '../models/space-env.model'

export const GetSpace = createParamDecorator((_data: unknown, ctx: ExecutionContext): SpaceEnv => {
  return ctx.switchToHttp().getRequest().space
})
