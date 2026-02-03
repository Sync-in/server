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
