import { loadVersion } from './app.functions.js'

export const VERSION = loadVersion()
export const USER_AGENT = `sync-in-server/${VERSION}`
export const CONTENT_SECURITY_POLICY = (xOfficeServer: string, collaboraServer: string, drawioServer: string) => ({
  useDefaults: false,
  directives: {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    objectSrc: ["'none'"],
    // Angular's production CSS loader uses an inline script and an inline load handler.
    scriptSrc: ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", xOfficeServer || ''],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:'],
    fontSrc: ["'self'"],
    frameSrc: ["'self'", 'blob:', xOfficeServer || '', collaboraServer || '', drawioServer || ''],
    frameAncestors: ["'self'"],
    formAction: ["'self'", collaboraServer || '']
  }
})

export const CONNECT_ERROR_CODE = new Set(['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'])
