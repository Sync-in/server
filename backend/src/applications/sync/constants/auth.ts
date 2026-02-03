export enum CLIENT_AUTH_TYPE {
  COOKIE = 'cookie',
  TOKEN = 'token'
}

export const CLIENT_TOKEN_EXPIRATION_TIME = '120d'
export const CLIENT_TOKEN_RENEW_TIME = '60d'
export const CLIENT_TOKEN_EXPIRED_ERROR = 'Client token is expired'
