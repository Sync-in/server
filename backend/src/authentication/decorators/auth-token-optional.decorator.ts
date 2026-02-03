import { applyDecorators, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { AuthTokenSkip } from './auth-token-skip.decorator'

export const AuthTokenOptional = () => {
  // skip global auth access guard and apply guards successively to context
  return applyDecorators(AuthTokenSkip(), UseGuards(AuthGuard(['tokenAccess', 'anonymous'])))
}
