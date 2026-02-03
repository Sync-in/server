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

export class JwtPayload {
  identity: JwtIdentityPayload
  csrf?: string
  iat?: number
  exp: number
}
