import { Injectable } from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'
import { AUTH_RATE_LIMIT_ERROR_MESSAGE } from '../constants/auth'

@Injectable()
export class AuthRateLimitGuard extends ThrottlerGuard {
  protected override errorMessage = AUTH_RATE_LIMIT_ERROR_MESSAGE
}
