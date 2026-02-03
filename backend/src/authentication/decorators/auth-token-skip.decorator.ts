import { SetMetadata } from '@nestjs/common'

export const AUTH_TOKEN_SKIP = 'authTokenSkip'
export const AuthTokenSkip = () => SetMetadata(AUTH_TOKEN_SKIP, true)
