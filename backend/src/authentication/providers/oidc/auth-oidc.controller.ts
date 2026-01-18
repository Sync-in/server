/*
 * Copyright (C) 2012-2026 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Controller, Get, HttpStatus, Query, Req, Res } from '@nestjs/common'
import { FastifyReply, FastifyRequest } from 'fastify'
import type { UserModel } from '../../../applications/users/models/user.model'
import { AuthManager } from '../../auth.service'
import { AUTH_ROUTE } from '../../constants/routes'
import { AuthTokenSkip } from '../../decorators/auth-token-skip.decorator'
import type { LoginResponseDto } from '../../dto/login-response.dto'
import { AuthProviderOIDC } from './auth-provider-oidc.service'

@Controller(AUTH_ROUTE.BASE)
export class AuthOIDCController {
  constructor(
    private readonly authManager: AuthManager,
    private readonly authMethodOidc: AuthProviderOIDC
  ) {}

  @Get(AUTH_ROUTE.OIDC_LOGIN)
  @AuthTokenSkip()
  async oidcLogin(@Res() res: FastifyReply): Promise<void> {
    const url = await this.authMethodOidc.getAuthorizationUrl(res)
    // Redirect to OIDC provider
    return res.redirect(url, HttpStatus.FOUND)
  }

  @Get(AUTH_ROUTE.OIDC_CALLBACK)
  @AuthTokenSkip()
  async oidcCallback(@Query() query: Record<string, string>, @Req() req: FastifyRequest, @Res() res: FastifyReply): Promise<void> {
    const user: UserModel = await this.authMethodOidc.handleCallback(req, res, query)
    const r: LoginResponseDto = await this.authManager.setCookies(user, res, false)
    return res.redirect(this.authMethodOidc.getRedirectCallbackUrl(r.token.access_expiration, r.token.refresh_expiration), HttpStatus.FOUND)
  }
}
