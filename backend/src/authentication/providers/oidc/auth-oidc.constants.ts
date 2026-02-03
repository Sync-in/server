export enum OAuthTokenEndpoint {
  ClientSecretPost = 'client_secret_post',
  ClientSecretBasic = 'client_secret_basic'
}

export const OAuthCookie = {
  State: 'oidc_state',
  Nonce: 'oidc_nonce',
  CodeVerifier: 'oidc_code_verifier'
} as const

export const OAuthCookieSettings = { httpOnly: true, path: '/', maxAge: 600, sameSite: 'lax' } as const
