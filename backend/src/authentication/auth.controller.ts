import { Body, Controller, Get, Header, Param, ParseIntPipe, Post, Req, Res, UseGuards } from '@nestjs/common'
import { type FastifyReply } from 'fastify'
import { USER_ROLE } from '../applications/users/constants/user.js'
import { UserHaveRole } from '../applications/users/decorators/roles.decorator.js'
import { GetUser } from '../applications/users/decorators/user.decorator.js'
import { UserRolesGuard } from '../applications/users/guards/roles.guard.js'
import { UserModel } from '../applications/users/models/user.model.js'
import { AvailabilitySkip } from '../infrastructure/availability/availability.decorator.js'
import { AuthManager } from './auth.service.js'
import { ACCESS_KEY, TOKEN_PATHS } from './constants/auth.js'
import { AUTH_ROUTE } from './constants/routes.js'
import { AuthTokenSkip } from './decorators/auth-token-skip.decorator.js'
import { LoginResponseDto, LoginVerify2FaDto } from './dto/login-response.dto.js'
import { TokenResponseDto } from './dto/token-response.dto.js'
import { AuthLocalGuard } from './guards/auth-local.guard.js'
import { AuthRateLimitGuard } from './guards/auth-rate-limit.guard.js'
import { AuthTokenRefreshGuard } from './guards/auth-token-refresh.guard.js'
import { type FastifyAuthenticatedRequest } from './interfaces/auth-request.interface.js'
import { TOKEN_TYPE } from './interfaces/token.interface.js'
import type { AuthOIDCSettings } from './providers/oidc/auth-oidc.interfaces.js'
import { AuthProvider2FA } from './providers/two-fa/auth-provider-two-fa.service.js'
import { AuthTokenTwoFaGuard } from './providers/two-fa/guards/auth-token-two-fa.guard.js'
import { AuthTwoFaVerificationGuard, AuthTwoFaVerificationWithoutPasswordGuard } from './providers/two-fa/guards/auth-two-fa-verification.guard.js'
import { TwoFaResponseDto, TwoFaVerifyDto, TwoFaVerifyWithPasswordDto } from './providers/two-fa/auth-two-fa.dtos.js'
import { TwoFaSetup, TwoFaVerifyResult } from './providers/two-fa/auth-two-fa.interfaces.js'

@Controller(AUTH_ROUTE.BASE)
export class AuthController {
  constructor(
    private readonly authManager: AuthManager,
    private readonly authProvider2FA: AuthProvider2FA
  ) {}

  @Post(AUTH_ROUTE.LOGIN)
  @AuthTokenSkip()
  @UseGuards(AuthRateLimitGuard, AuthLocalGuard)
  login(@GetUser() user: UserModel, @Res({ passthrough: true }) res: FastifyReply): Promise<LoginResponseDto | LoginVerify2FaDto> {
    return this.authManager.setCookies(user, res, true)
  }

  @Post(AUTH_ROUTE.LOGOUT)
  @AuthTokenSkip()
  @AvailabilitySkip()
  logout(@Res({ passthrough: true }) res: FastifyReply) {
    return this.authManager.clearCookies(res)
  }

  @Post(AUTH_ROUTE.REFRESH)
  @AuthTokenSkip()
  @UseGuards(AuthTokenRefreshGuard)
  refreshCookies(@GetUser() user: UserModel, @Res({ passthrough: true }) res: FastifyReply): Promise<LoginResponseDto> {
    return this.authManager.refreshCookies(user, res)
  }

  @Post(AUTH_ROUTE.TOKEN)
  @Header('Cache-Control', 'no-store')
  @AuthTokenSkip()
  @UseGuards(AuthRateLimitGuard, AuthLocalGuard, AuthTwoFaVerificationWithoutPasswordGuard)
  token(@GetUser() user: UserModel): Promise<TokenResponseDto> {
    return this.authManager.getTokens(user)
  }

  @Post(AUTH_ROUTE.TOKEN_REFRESH)
  @Header('Cache-Control', 'no-store')
  @AuthTokenSkip()
  @UseGuards(AuthTokenRefreshGuard)
  refreshToken(@GetUser() user: UserModel): Promise<TokenResponseDto> {
    return this.authManager.getTokens(user, true)
  }

  @Get(AUTH_ROUTE.SETTINGS)
  @AuthTokenSkip()
  authSettings(): AuthOIDCSettings | false {
    return this.authManager.authSettings()
  }

  /* TWO-FA Part */

  @Get(`${AUTH_ROUTE.TWO_FA_BASE}/${AUTH_ROUTE.TWO_FA_ENABLE}`)
  @Header('Cache-Control', 'no-store')
  @UseGuards(UserRolesGuard)
  @UserHaveRole(USER_ROLE.USER)
  twoFaInit(@GetUser() user: UserModel): Promise<TwoFaSetup> {
    return this.authProvider2FA.initTwoFactor(user)
  }

  @Post(`${AUTH_ROUTE.TWO_FA_BASE}/${AUTH_ROUTE.TWO_FA_ENABLE}`)
  @Header('Cache-Control', 'no-store')
  @UseGuards(AuthRateLimitGuard, UserRolesGuard)
  @UserHaveRole(USER_ROLE.USER)
  twoFaEnable(@Body() body: TwoFaVerifyWithPasswordDto, @Req() req: FastifyAuthenticatedRequest): Promise<TwoFaVerifyResult> {
    return this.authProvider2FA.enableTwoFactor(body, req)
  }

  @Post(`${AUTH_ROUTE.TWO_FA_BASE}/${AUTH_ROUTE.TWO_FA_DISABLE}`)
  @UseGuards(AuthRateLimitGuard, UserRolesGuard)
  @UserHaveRole(USER_ROLE.USER)
  twoFaDisable(@Body() body: TwoFaVerifyWithPasswordDto, @Req() req: FastifyAuthenticatedRequest): Promise<TwoFaVerifyResult> {
    return this.authProvider2FA.disableTwoFactor(body, req)
  }

  @Post(`${AUTH_ROUTE.TWO_FA_BASE}/${AUTH_ROUTE.TWO_FA_LOGIN_VERIFY}`)
  @AuthTokenSkip()
  @UseGuards(AuthRateLimitGuard, AuthTokenTwoFaGuard, UserRolesGuard)
  @UserHaveRole(USER_ROLE.USER)
  async twoFaLogin(
    @Body() body: TwoFaVerifyDto,
    @Req() req: FastifyAuthenticatedRequest,
    @Res({ passthrough: true }) res: FastifyReply
  ): Promise<TwoFaResponseDto | TwoFaVerifyResult> {
    const [authStatus, user] = await this.authProvider2FA.verify(body, req, true)
    if (authStatus.success) {
      const loginResponseDto = await this.authManager.setCookies(user, res)
      // clear the temporary 2FA cookie
      res.clearCookie(ACCESS_KEY, { path: TOKEN_PATHS[TOKEN_TYPE.ACCESS_2FA], httpOnly: true })
      return { ...loginResponseDto, ...authStatus } satisfies TwoFaResponseDto
    }
    return authStatus
  }

  @Post(`${AUTH_ROUTE.TWO_FA_BASE}/${AUTH_ROUTE.TWO_FA_ADMIN_RESET_USER}/:id`)
  @UseGuards(AuthRateLimitGuard, UserRolesGuard, AuthTwoFaVerificationGuard)
  @UserHaveRole(USER_ROLE.ADMINISTRATOR)
  twoFaReset(@Param('id', ParseIntPipe) userId: number): Promise<TwoFaVerifyResult> {
    return this.authProvider2FA.adminResetUserTwoFa(userId)
  }
}
