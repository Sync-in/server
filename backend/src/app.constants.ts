import { loadVersion } from './app.functions'

export const VERSION = loadVersion()
export const USER_AGENT = `sync-in-server/${VERSION}`
export const CONTENT_SECURITY_POLICY = (xOfficeServer: string, collaboraServer: string) => ({
  useDefaults: false,
  directives: {
    defaultSrc: ["'self'", xOfficeServer || '', collaboraServer || ''],
    scriptSrc: ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", xOfficeServer || ''],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:'],
    fontSrc: ["'self'"]
  }
})

export const CONNECT_ERROR_CODE = new Set(['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'])
