import { TOKEN_TYPE } from './token.interface'

export class JwtIdentityPayload {
  id: number
  login: string
  email: string
  fullName: string
  language: string
  role: number
  applications: string[]
  impersonatedFromId?: number
  impersonatedClientId?: string
  clientId?: string
  twoFaEnabled?: boolean
}

export class JwtIdentity2FaPayload {
  id: number
  login: string
  language: string
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
