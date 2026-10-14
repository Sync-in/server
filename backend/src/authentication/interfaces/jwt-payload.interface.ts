import type { AUTH_SESSION } from '../providers/auth-providers.constants.js'
import { TOKEN_TYPE } from './token.interface.js'

export interface JwtIdentityPreferences {
  showHiddenFiles: boolean
}

export interface JwtIdentityPayload {
  id: number
  login: string
  email: string
  fullName: string
  language: string | null
  role: number
  applications: string[]
  impersonatedFromId?: number
  impersonatedClientId?: string
  authSession?: AUTH_SESSION
  clientId?: string
  twoFaEnabled?: boolean
  preferences?: JwtIdentityPreferences
}

export interface JwtIdentity2FaPayload {
  id: number
  login: string
  language: string | null
  role: number
  twoFaEnabled: true
}

export interface JwtPayloadBase {
  csrf?: string
  iat?: number
  exp: number
}

export type JwtPayload =
  | (JwtPayloadBase & {
      identity: JwtIdentityPayload
      tokenType: TOKEN_TYPE.ACCESS | TOKEN_TYPE.REFRESH | TOKEN_TYPE.WS | TOKEN_TYPE.ONLY_OFFICE
    })
  | (JwtPayloadBase & {
      identity: JwtIdentity2FaPayload
      tokenType: TOKEN_TYPE.ACCESS_2FA
    })
