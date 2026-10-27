export const LINK_ERROR = {
  UNAUTHORIZED: 'unauthorized',
  DISABLED: 'disabled',
  EXCEEDED: 'exceeded',
  EXPIRED: 'expired',
  NOT_FOUND: 'not found'
} as const

export enum LINK_TYPE {
  SPACE = 'space',
  SHARE = 'share'
}

export const LINK_DOWNLOAD_RATE_LIMIT_OPTIONS = {
  limit: 30,
  ttl: 60_000,
  blockDuration: 60_000
} as const
