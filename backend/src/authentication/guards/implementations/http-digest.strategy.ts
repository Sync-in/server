import crypto from 'node:crypto'
import { Strategy as PassportStrategy } from 'passport-strategy'

export interface DigestValidateParams {
  nonce?: string
  cnonce?: string
  nc?: string
  opaque?: string
}

export type DigestValidateCallback = (err?: any, valid?: boolean) => void

// ⚠️ verify (secret callback) : on attend un "user container" qui contient aussi le secret
export type DigestVerifyCallback = (err?: any, result?: any) => void

export type DigestVerifyFunction = (username: string, done: DigestVerifyCallback) => void
export type DigestVerifyFunctionWithRequest = (req: any, username: string, done: DigestVerifyCallback) => void

export type DigestSecret =
  | string // password en clair (rare)
  | { ha1: string } // recommandé : HA1 = MD5(username:realm:password)

export interface DigestVerifyResult {
  user: any
  secret: DigestSecret
}

export interface HttpDigestStrategyOptionsBase {
  realm?: string
  domain?: string | string[]
  opaque?: string
  algorithm?: 'MD5' | 'MD5-sess'
  qop?: ('auth' | 'auth-int')[] | 'auth' | 'auth-int'
  // optionnel : anti-replay
  validate?: (params: DigestValidateParams, done: DigestValidateCallback) => void
}

export type HttpDigestStrategyOptionsWithReq = HttpDigestStrategyOptionsBase & {
  passReqToCallback: true
}

export type HttpDigestStrategyOptionsNoReq = HttpDigestStrategyOptionsBase & {
  passReqToCallback?: false | undefined
}

function md5(str: string, encoding: crypto.BinaryToTextEncoding = 'hex'): string {
  return crypto.createHash('md5').update(str).digest(encoding)
}

function nonce(len: number): string {
  const buf: string[] = []
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const charlen = chars.length
  for (let i = 0; i < len; ++i) {
    buf.push(chars[(Math.random() * charlen) | 0])
  }
  return buf.join('')
}

// parsing identique à digest.js
function parse(params: string): Record<string, string> {
  const opts: Record<string, string> = {}
  const tokens = params.split(/,(?=(?:[^"]|"[^"]*")*$)/)
  for (const token of tokens) {
    const m = /(\w+)=["]?([^"]+)["]?$/.exec(token)
    if (m) opts[m[1]] = m[2]
  }
  return opts
}

export class HttpDigestStrategy extends PassportStrategy {
  name = 'digest'

  private readonly realm: string
  private readonly domain?: string[]
  private readonly opaque?: string
  private readonly algorithm?: 'MD5' | 'MD5-sess'
  private readonly qop?: ('auth' | 'auth-int')[]
  private readonly passReqToCallback: boolean
  private readonly validateCb?: (params: DigestValidateParams, done: DigestValidateCallback) => void

  private readonly verify: DigestVerifyFunction | DigestVerifyFunctionWithRequest

  // overloads typés selon passReqToCallback
  constructor(options: HttpDigestStrategyOptionsWithReq, verify: DigestVerifyFunctionWithRequest)
  constructor(options?: HttpDigestStrategyOptionsNoReq, verify?: DigestVerifyFunction)
  constructor(
    options: HttpDigestStrategyOptionsWithReq | HttpDigestStrategyOptionsNoReq = {},
    verify?: DigestVerifyFunction | DigestVerifyFunctionWithRequest
  ) {
    super()
    if (!verify) throw new Error('HTTP Digest authentication strategy requires a secret function')

    this.verify = verify
    this.realm = options.realm ?? 'Users'

    if (options.domain) this.domain = Array.isArray(options.domain) ? options.domain : [options.domain]
    this.opaque = options.opaque
    this.algorithm = options.algorithm
    this.qop = options.qop ? (Array.isArray(options.qop) ? options.qop : [options.qop]) : undefined

    this.validateCb = options.validate
    this.passReqToCallback = (options as HttpDigestStrategyOptionsWithReq).passReqToCallback === true
  }

  authenticate(req: any): void {
    const authorization: string | undefined = req?.headers?.authorization
    if (!authorization) {
      return this.fail(this.challenge(), 401)
    }

    const parts = authorization.split(' ')
    if (parts.length < 2) return this.fail(400 as any)

    const scheme = parts[0]
    const params = parts.slice(1).join(' ')
    if (!/Digest/i.test(scheme)) {
      return this.fail(this.challenge(), 401)
    }

    const creds = parse(params)
    if (Object.keys(creds).length === 0) return this.fail(400 as any)
    if (!creds.username) return this.fail(this.challenge(), 401)

    // Même check que digest.js : req.url doit matcher creds.uri
    // (en Fastify, req.url inclut la querystring, ce qui est généralement OK)
    if (req.url !== creds.uri) return this.fail(400 as any)

    const verified: DigestVerifyCallback = (err, result) => {
      if (err) return this.error(err)
      if (!result || !result.user) return this.fail(this.challenge(), 401)

      const { user, secret } = result as DigestVerifyResult
      if (!secret) return this.fail(400 as any)

      // compute HA1
      let ha1: string
      const algo = creds.algorithm || 'MD5'
      if (algo === 'MD5') {
        if (typeof secret === 'object' && (secret as any).ha1) {
          ha1 = (secret as any).ha1
        } else {
          // password en clair (peu probable)
          ha1 = md5(`${creds.username}:${creds.realm}:${String(secret)}`)
        }
      } else if (algo === 'MD5-sess') {
        // idem digest.js (note: nonce/cnonce init non gérés)
        const base =
          typeof secret === 'object' && (secret as any).ha1 ? (secret as any).ha1 : md5(`${creds.username}:${creds.realm}:${String(secret)}`)
        ha1 = md5(`${base}:${creds.nonce}:${creds.cnonce}`)
      } else {
        return this.fail(400 as any)
      }

      // compute HA2
      let ha2: string
      if (!creds.qop || creds.qop === 'auth') {
        ha2 = md5(`${req.method}:${creds.uri}`)
      } else if (creds.qop === 'auth-int') {
        return this.error(new Error('auth-int not implemented'))
      } else {
        return this.fail(400 as any)
      }

      // compute expected digest
      let digest: string
      if (!creds.qop) {
        digest = md5(`${ha1}:${creds.nonce}:${ha2}`)
      } else if (creds.qop === 'auth' || creds.qop === 'auth-int') {
        digest = md5(`${ha1}:${creds.nonce}:${creds.nc}:${creds.cnonce}:${creds.qop}:${ha2}`)
      } else {
        return this.fail(400 as any)
      }

      if (creds.response !== digest) {
        return this.fail(this.challenge(), 401)
      }

      if (this.validateCb) {
        return this.validateCb({ nonce: creds.nonce, cnonce: creds.cnonce, nc: creds.nc, opaque: creds.opaque }, (e, ok) => {
          if (e) return this.error(e)
          if (!ok) return this.fail(this.challenge(), 401)
          return this.success(user)
        })
      }

      return this.success(user)
    }

    if (this.passReqToCallback) {
      ;(this.verify as DigestVerifyFunctionWithRequest)(req, creds.username, verified)
    } else {
      ;(this.verify as DigestVerifyFunction)(creds.username, verified)
    }
  }

  private challenge(): string {
    let challenge = `Digest realm="${this.realm}"`
    if (this.domain) challenge += `, domain="${this.domain.join(' ')}"`
    challenge += `, nonce="${nonce(32)}"`
    if (this.opaque) challenge += `, opaque="${this.opaque}"`
    if (this.algorithm) challenge += `, algorithm=${this.algorithm}`
    if (this.qop) challenge += `, qop="${this.qop.join(',')}"`
    return challenge
  }
}
