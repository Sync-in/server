/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Body, Controller, Get, Param, ParseIntPipe, Post, Req, Res, UseGuards } from '@nestjs/common'
import { FastifyReply } from 'fastify'
import { USER_ROLE } from '../applications/users/constants/user'
import { UserHaveRole } from '../applications/users/decorators/roles.decorator'
import { GetUser } from '../applications/users/decorators/user.decorator'
import { UserRolesGuard } from '../applications/users/guards/roles.guard'
import { UserModel } from '../applications/users/models/user.model'
import { AuthManager } from './auth.service'
import { ACCESS_KEY, TOKEN_PATHS } from './constants/auth'
import { AUTH_ROUTE } from './constants/routes'
import { AuthTokenSkip } from './decorators/auth-token-skip.decorator'
import { LoginResponseDto, LoginVerify2FaDto } from './dto/login-response.dto'
import { TokenResponseDto } from './dto/token-response.dto'
import { AuthLocalGuard } from './guards/auth-local.guard'
import { AuthTokenRefreshGuard } from './guards/auth-token-refresh.guard'
import { FastifyAuthenticatedRequest } from './interfaces/auth-request.interface'
import { TOKEN_TYPE } from './interfaces/token.interface'
import { AuthProvider2FA } from './providers/two-fa/auth-provider-two-fa.service'
import { AuthTwoFaGuard } from './providers/two-fa/auth-two-fa-guard'
import { TwoFaResponseDto, TwoFaVerifyDto, TwoFaVerifyWithPasswordDto } from './providers/two-fa/auth-two-fa.dtos'
import { TwoFaSetup, TwoFaVerifyResult } from './providers/two-fa/auth-two-fa.interfaces'

@Controller(AUTH_ROUTE.BASE)
export class AuthController {
  constructor(
    private readonly authManager: AuthManager,
    private readonly authMethod2FA: AuthProvider2FA
  ) {}

  @Post(AUTH_ROUTE.LOGIN)
  @AuthTokenSkip()
  @UseGuards(AuthLocalGuard)
  login(@GetUser() user: UserModel, @Res({ passthrough: true }) res: FastifyReply): Promise<LoginResponseDto | LoginVerify2FaDto> {
    return this.authManager.setCookies(user, res, true)
  }

  @Post(AUTH_ROUTE.LOGOUT)
  @AuthTokenSkip()
  logout(@Res({ passthrough: true }) res: FastifyReply) {
    return this.authManager.clearCookies(res)
  }

  @Post(AUTH_ROUTE.REFRESH)
  @AuthTokenSkip()
  @UseGuards(AuthTokenRefreshGuard)
  refreshCookies(@GetUser() user: UserModel, @Res({ passthrough: true }) res: FastifyReply): Promise<TokenResponseDto> {
    return this.authManager.refreshCookies(user, res)
  }

  @Post(AUTH_ROUTE.TOKEN)
  @AuthTokenSkip()
  @UseGuards(AuthLocalGuard)
  token(@GetUser() user: UserModel): Promise<TokenResponseDto> {
    return this.authManager.getTokens(user)
  }

  @Post(AUTH_ROUTE.TOKEN_REFRESH)
  @AuthTokenSkip()
  @UseGuards(AuthTokenRefreshGuard)
  refreshToken(@GetUser() user: UserModel): Promise<TokenResponseDto> {
    return this.authManager.getTokens(user, true)
  }

  /* TWO-FA Part */

  @Get(`${AUTH_ROUTE.TWO_FA_BASE}/${AUTH_ROUTE.TWO_FA_ENABLE}`)
  @UseGuards(UserRolesGuard)
  @UserHaveRole(USER_ROLE.USER)
  twoFaInit(@GetUser() user: UserModel): Promise<TwoFaSetup> {
    return this.authMethod2FA.initTwoFactor(user)
  }

  @Post(`${AUTH_ROUTE.TWO_FA_BASE}/${AUTH_ROUTE.TWO_FA_ENABLE}`)
  @UseGuards(UserRolesGuard)
  @UserHaveRole(USER_ROLE.USER)
  twoFaEnable(@Body() body: TwoFaVerifyWithPasswordDto, @Req() req: FastifyAuthenticatedRequest): Promise<TwoFaVerifyResult> {
    return this.authMethod2FA.enableTwoFactor(body, req)
  }

  @Post(`${AUTH_ROUTE.TWO_FA_BASE}/${AUTH_ROUTE.TWO_FA_DISABLE}`)
  @UseGuards(UserRolesGuard)
  @UserHaveRole(USER_ROLE.USER)
  twoFaDisable(@Body() body: TwoFaVerifyWithPasswordDto, @Req() req: FastifyAuthenticatedRequest): Promise<TwoFaVerifyResult> {
    return this.authMethod2FA.disableTwoFactor(body, req)
  }

  @Post(`${AUTH_ROUTE.TWO_FA_BASE}/${AUTH_ROUTE.TWO_FA_LOGIN_VERIFY}`)
  @UseGuards(UserRolesGuard)
  @UserHaveRole(USER_ROLE.USER)
  async twoFaLogin(
    @Body() body: TwoFaVerifyDto,
    @Req() req: FastifyAuthenticatedRequest,
    @Res({ passthrough: true }) res: FastifyReply
  ): Promise<TwoFaResponseDto | TwoFaVerifyResult> {
    const [authStatus, user] = await this.authMethod2FA.verify(body, req, true)
    if (authStatus.success) {
      const loginResponseDto = await this.authManager.setCookies(user, res)
      // clear the temporary 2FA cookie
      res.clearCookie(ACCESS_KEY, { path: TOKEN_PATHS[TOKEN_TYPE.ACCESS_2FA], httpOnly: true })
      return { ...loginResponseDto, ...authStatus } satisfies TwoFaResponseDto
    }
    return authStatus
  }

  @Post(`${AUTH_ROUTE.TWO_FA_BASE}/${AUTH_ROUTE.TWO_FA_ADMIN_RESET_USER}/:id`)
  @UseGuards(UserRolesGuard, AuthTwoFaGuard)
  @UserHaveRole(USER_ROLE.ADMINISTRATOR)
  twoFaReset(@Param('id', ParseIntPipe) userId: number): Promise<TwoFaVerifyResult> {
    return this.authMethod2FA.adminResetUserTwoFa(userId)
  }
}
