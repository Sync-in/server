import { Injectable } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { Strategy } from 'passport-strategy'

@Injectable()
export class AuthAnonymousStrategy extends PassportStrategy(Strategy, 'anonymous') {
  declare validate: (...args: unknown[]) => unknown

  constructor() {
    super()
  }

  authenticate() {
    return this.success({ id: 0, login: 'anonymous' })
  }
}
