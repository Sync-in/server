/*
 * Copyright (C) 2012-2026 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Strategy as PassportStrategy } from 'passport-strategy'

export type BasicVerifyCallback = (err?: any, user?: any) => void

export type BasicVerifyFunction = (userid: string, password: string, done: BasicVerifyCallback) => void

export type BasicVerifyFunctionWithRequest = (req: any, userid: string, password: string, done: BasicVerifyCallback) => void

function splitFirst(str: string, sep: string): [string] | [string, string] {
  const i = str.indexOf(sep)
  if (i < 0) return [str]
  return [str.substring(0, i), str.substring(i + 1)]
}

export interface HttpBasicStrategyOptions {
  realm?: string
  passReqToCallback?: boolean
}

/**
 * Pure HTTP Basic authentication strategy
 **/
export class HttpBasicStrategy extends PassportStrategy {
  name = 'basic'

  private readonly verify: BasicVerifyFunction | BasicVerifyFunctionWithRequest
  private readonly realm: string
  private readonly passReqToCallback: boolean

  constructor(options: HttpBasicStrategyOptions = {}, verify: BasicVerifyFunction | BasicVerifyFunctionWithRequest) {
    super()

    if (!verify) {
      throw new TypeError('HttpBasicStrategy requires a verify callback')
    }

    this.verify = verify
    this.realm = options.realm ?? 'Sync-in'
    this.passReqToCallback = !!options.passReqToCallback
  }

  authenticate(req: any): void {
    const authorization: string | undefined = req?.headers?.authorization
    if (!authorization) {
      return this.fail(this.challenge(), 401)
    }

    const parts = authorization.split(' ')
    if (parts.length !== 2) {
      return this.fail(400)
    }

    if (!/^Basic$/i.test(parts[0])) {
      return this.fail(this.challenge(), 401)
    }

    let decoded: string
    try {
      decoded = Buffer.from(parts[1], 'base64').toString()
    } catch {
      return this.fail(400)
    }

    const [userid, password] = splitFirst(decoded, ':')
    if (password === undefined) {
      return this.fail(400)
    }

    const verified: BasicVerifyCallback = (err, user) => {
      if (err) return this.error(err)
      if (!user) return this.fail(this.challenge(), 401)
      return this.success(user)
    }

    if (this.passReqToCallback) {
      ;(this.verify as BasicVerifyFunctionWithRequest)(req, userid, password, verified)
    } else {
      ;(this.verify as BasicVerifyFunction)(userid, password, verified)
    }
  }

  private challenge(): string {
    return `Basic realm="${this.realm}"`
  }
}
