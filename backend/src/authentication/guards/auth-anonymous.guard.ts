import { Injectable } from '@nestjs/common'
import { AuthGuard, IAuthGuard } from '@nestjs/passport'

@Injectable()
export class AuthAnonymousGuard extends AuthGuard('anonymous') implements IAuthGuard {
  constructor() {
    super()
  }
}
