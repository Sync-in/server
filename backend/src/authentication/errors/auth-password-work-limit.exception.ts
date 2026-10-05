import { UnauthorizedException } from '@nestjs/common'

export class AuthPasswordWorkLimitException extends UnauthorizedException {
  constructor() {
    super('Wrong login or password')
  }
}
