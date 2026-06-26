import { createMock, DeepMocked } from '@golevelup/ts-vitest'
import { CanActivate, ExecutionContext } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import type { MockInstance } from 'vitest'
import { UserModel } from '../../../../applications/users/models/user.model'
import { configuration } from '../../../../configuration/config.environment'
import { TWO_FA_HEADER_CODE, TWO_FA_HEADER_PASSWORD } from '../../../constants/auth'
import { FastifyAuthenticatedRequest } from '../../../interfaces/auth-request.interface'
import { AuthProvider2FA } from '../auth-provider-two-fa.service'
import type { TwoFaVerifyDto } from '../auth-two-fa.dtos'
import type { TwoFaVerifyResult } from '../auth-two-fa.interfaces'
import { AuthTwoFaVerificationOrPasswordGuard } from './auth-two-fa-verification.guard'

type VerifyWithoutLogin = (verifyDto: TwoFaVerifyDto, req: FastifyAuthenticatedRequest) => Promise<TwoFaVerifyResult>

describe(AuthTwoFaVerificationOrPasswordGuard.name, () => {
  const originalTotpEnabled = configuration.auth.mfa.totp.enabled
  const userWithTotp = { id: 1, twoFaEnabled: true } as UserModel
  const userWithoutTotp = { id: 1, twoFaEnabled: false } as UserModel
  let guard: CanActivate
  let authProvider2FA: DeepMocked<AuthProvider2FA>

  beforeAll(async () => {
    authProvider2FA = createMock<AuthProvider2FA>()
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthTwoFaVerificationOrPasswordGuard,
        {
          provide: AuthProvider2FA,
          useValue: authProvider2FA
        }
      ]
    }).compile()

    guard = module.get<CanActivate>(AuthTwoFaVerificationOrPasswordGuard)
  })

  beforeEach(() => {
    configuration.auth.mfa.totp.enabled = true
    vi.resetAllMocks()
  })

  afterAll(() => {
    configuration.auth.mfa.totp.enabled = originalTotpEnabled
  })

  it('should verify TOTP without requiring the password when the user has TOTP enabled', async () => {
    authProvider2FA.loadUser.mockResolvedValue(userWithTotp)
    mockVerifyResult(authProvider2FA, { success: true, message: '' })

    const context = makeContext({ [TWO_FA_HEADER_CODE]: '123456' })

    await expect(guard.canActivate(context)).resolves.toBe(true)
    expect(authProvider2FA.loadUser).toHaveBeenCalledWith(userWithTotp.id, '127.0.0.1')
    expect(authProvider2FA.verifyUserPassword).not.toHaveBeenCalled()
    expect(authProvider2FA.verify).toHaveBeenCalledWith({ code: '123456' }, context.switchToHttp().getRequest())
  })

  it('should require the current password instead of TOTP when the user has no TOTP enabled', async () => {
    authProvider2FA.loadUser.mockResolvedValue(userWithoutTotp)
    authProvider2FA.verifyUserPassword.mockResolvedValue(undefined)

    await expect(guard.canActivate(makeContext({ [TWO_FA_HEADER_PASSWORD]: 'password' }))).resolves.toBe(true)
    expect(authProvider2FA.verifyUserPassword).toHaveBeenCalledWith(userWithoutTotp, 'password', '127.0.0.1')
    expect(authProvider2FA.verify).not.toHaveBeenCalled()
  })

  it('should require the current password when global TOTP is disabled', async () => {
    configuration.auth.mfa.totp.enabled = false
    authProvider2FA.loadUser.mockResolvedValue(userWithTotp)
    authProvider2FA.verifyUserPassword.mockResolvedValue(undefined)

    await expect(guard.canActivate(makeContext({ [TWO_FA_HEADER_PASSWORD]: 'password' }))).resolves.toBe(true)
    expect(authProvider2FA.verifyUserPassword).toHaveBeenCalledWith(userWithTotp, 'password', '127.0.0.1')
    expect(authProvider2FA.verify).not.toHaveBeenCalled()
  })

  it('should reject the request when the password fallback is missing', async () => {
    authProvider2FA.loadUser.mockResolvedValue(userWithoutTotp)

    await expect(guard.canActivate(makeContext())).rejects.toThrow('Missing TWO-FA password')
    expect(authProvider2FA.verifyUserPassword).not.toHaveBeenCalled()
    expect(authProvider2FA.verify).not.toHaveBeenCalled()
  })

  it('should reject the request when the password fallback is invalid', async () => {
    authProvider2FA.loadUser.mockResolvedValue(userWithoutTotp)
    authProvider2FA.verifyUserPassword.mockRejectedValue(new Error('Invalid password'))

    await expect(guard.canActivate(makeContext({ [TWO_FA_HEADER_PASSWORD]: 'wrong-password' }))).rejects.toThrow('Invalid password')
    expect(authProvider2FA.verifyUserPassword).toHaveBeenCalledWith(userWithoutTotp, 'wrong-password', '127.0.0.1')
    expect(authProvider2FA.verify).not.toHaveBeenCalled()
  })

  it('should reject the request when the TOTP code is missing', async () => {
    authProvider2FA.loadUser.mockResolvedValue(userWithTotp)

    await expect(guard.canActivate(makeContext())).rejects.toThrow('Missing TWO-FA code')
    expect(authProvider2FA.verifyUserPassword).not.toHaveBeenCalled()
    expect(authProvider2FA.verify).not.toHaveBeenCalled()
  })

  it('should reject the request when the TOTP code is invalid', async () => {
    authProvider2FA.loadUser.mockResolvedValue(userWithTotp)
    mockVerifyResult(authProvider2FA, { success: false, message: 'Invalid TOTP code' })

    await expect(guard.canActivate(makeContext({ [TWO_FA_HEADER_CODE]: '000000' }))).rejects.toThrow('Invalid TOTP code')
    expect(authProvider2FA.verifyUserPassword).not.toHaveBeenCalled()
    expect(authProvider2FA.verify).toHaveBeenCalledWith({ code: '000000' }, expect.any(Object))
  })
})

function mockVerifyResult(authProvider2FA: DeepMocked<AuthProvider2FA>, result: TwoFaVerifyResult): void {
  ;(authProvider2FA.verify as unknown as MockInstance<VerifyWithoutLogin>).mockResolvedValue(result)
}

function makeContext(headers: Record<string, string> = {}): DeepMocked<ExecutionContext> {
  const context = createMock<ExecutionContext>()
  context.switchToHttp().getRequest.mockReturnValue({
    user: { id: 1 },
    ip: '127.0.0.1',
    headers
  } as FastifyAuthenticatedRequest)
  return context
}
