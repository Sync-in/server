export interface AuthResult {
  success: boolean
  message: any
  twoFaEnabled?: boolean
}

export interface AuthOIDCQueryParams {
  oidc: string
  access_expiration: string
  refresh_expiration: string
}
