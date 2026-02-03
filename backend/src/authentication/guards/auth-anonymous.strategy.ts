import { Injectable } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { Strategy } from 'passport-strategy'

@Injectable()
export class AuthAnonymousStrategy extends PassportStrategy(Strategy, 'anonymous') {
  validate: undefined

  constructor() {
    super()
  }

  authenticate() {
    return this.success({ id: 0, login: 'anonymous' })
  }
}
