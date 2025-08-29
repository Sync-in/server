/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

// import { ExecutionContext, Injectable, Logger } from '@nestjs/common'
// import { AuthGuard, IAuthGuard } from '@nestjs/passport'
//
// @Injectable()
// export class AuthDigestGuard extends AuthGuard('digest') implements IAuthGuard {
//   private readonly logger = new Logger(AuthDigestGuard.name)
//
//   handleRequest<TUser = any>(err: any, user: any, info: Error, ctx: ExecutionContext, status?: any): TUser {
//     const request = this.getRequest(ctx)
//     request.raw.user = user ? user.login : 'unauthorized'
//     if (info) {
//       this.logger.warn(`<${request.raw.user}> <${request.ip}> ${info}`)
//     }
//     return super.handleRequest(err, user, info, ctx, status)
//   }
// }
