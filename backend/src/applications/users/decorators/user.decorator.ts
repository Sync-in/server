import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { UserModel } from '../models/user.model.js'

export const GetUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): UserModel => {
  return ctx.switchToHttp().getRequest().user
})
