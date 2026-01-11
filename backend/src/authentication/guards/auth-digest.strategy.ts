/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

// import { Injectable } from '@nestjs/common'
// import { PassportStrategy } from '@nestjs/passport'
// import { PinoLogger } from 'nestjs-pino'
// import { SERVER_NAME } from '../../common/shared'
//
// import { HttpDigestStrategy } from './implementations/http-digest.strategy'
//
// @Injectable()
// export class AuthDigestStrategy extends PassportStrategy(HttpDigestStrategy, 'digest') {
//   constructor(private readonly logger: PinoLogger) {
//     super({
//       realm: SERVER_NAME,
//       // Recommended options for RFC-compliant Digest (required for security)
//       qop: 'auth',
//       algorithm: 'MD5'
//       // Optional anti-replay validation hook
//       // validate: (params, done) => done(null, true),
//     })
//   }
//
//   async validate(loginOrEmail: string) {
//     loginOrEmail = loginOrEmail.trim()
//     this.logger.assign({ user: loginOrEmail })
//
//     // ⚠️ TO ADAPT: Digest authentication requires a server-side secret:
//     // - ideally a stored { ha1 } value (HA1 = MD5(username:realm:password))
//     // - otherwise the clear-text "password" (less secure, but possible)
//     //
//     // return [loginOrEmail, { ha1: '4befe40c6af915eca11de84be07a1f21' }]
//     // return [loginOrEmail, 'password']
//
//     // Method to get digest secret
//     const { user, ha1, password } = getDigestSecret(loginOrEmail, SERVER_NAME)
//
//     if (!user) return null
//
//     if (ha1) return [user, { ha1 }]
//     if (password) return [user, password]
//
//     return null
//   }
// }
