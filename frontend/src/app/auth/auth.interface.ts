export interface AuthResult {
  success: boolean
  message: any
  twoFaEnabled?: boolean
  retryAfter?: number
}

export interface AuthOIDCQueryParams {
  oidc: string
  access_expiration: string
  refresh_expiration: string
}
