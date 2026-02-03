import { loadVersion } from './app.functions'

export const VERSION = loadVersion()
export const USER_AGENT = `sync-in-server/${VERSION}`
export const CONTENT_SECURITY_POLICY = (onlyOfficeServer: string, collaboraServer: string) => ({
  useDefaults: false,
  directives: {
    defaultSrc: ["'self'", onlyOfficeServer || '', collaboraServer || ''],
    scriptSrc: ["'self'", "'unsafe-inline'", onlyOfficeServer || ''],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:'],
    fontSrc: ["'self'"]
  }
})

export const CONNECT_ERROR_CODE = new Set(['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'])
