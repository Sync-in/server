import { HttpException, HttpStatus } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { Totp } from 'time2fa'
import { NotificationsManager } from '../../../applications/notifications/services/notifications-manager.service'
import { UserModel } from '../../../applications/users/models/user.model'
import { UsersManager } from '../../../applications/users/services/users-manager.service'
import { Cache } from '../../../infrastructure/cache/services/cache.service'
import { FastifyAuthenticatedRequest } from '../../interfaces/auth-request.interface'
import { decryptSecret, encryptSecret } from '../../utils/crypt-secret'
import { AuthProvider2FA } from './auth-provider-two-fa.service'
import { TwoFaVerifyDto, TwoFaVerifyWithPasswordDto } from './auth-two-fa.dtos'

jest.mock('../../utils/crypt-secret')
jest.mock('../../../common/qrcode')

describe(AuthProvider2FA.name, () => {
  let service: AuthProvider2FA
  let cache: jest.Mocked<Cache>
  let usersManager: jest.Mocked<UsersManager>
  let notificationsManager: jest.Mocked<NotificationsManager>

  const mockUser: Partial<UserModel> = {
    id: 1,
    login: 'testuser',
    email: 'test@example.com',
    secrets: {
      twoFaSecret: 'encrypted-secret',
      recoveryCodes: ['encrypted-code-1', 'encrypted-code-2']
    }
  }

  const mockRequest: Partial<FastifyAuthenticatedRequest> = {
    user: { id: 1, login: 'testuser' } as any,
    ip: '127.0.0.1',
    headers: { 'user-agent': 'test-agent' }
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthProvider2FA,
        {
          provide: Cache,
          useValue: {
            get: jest.fn(),
            set: jest.fn()
          }
        },
        {
          provide: UsersManager,
          useValue: {
            fromUserId: jest.fn(),
            validateUserAccess: jest.fn(),
            compareUserPassword: jest.fn(),
            updateAccesses: jest.fn().mockResolvedValue(undefined),
            updateSecrets: jest.fn()
          }
        },
        {
          provide: NotificationsManager,
          useValue: {
            sendEmailNotification: jest.fn().mockResolvedValue(undefined)
          }
        }
      ]
    }).compile()

    module.useLogger(['fatal'])
    service = module.get<AuthProvider2FA>(AuthProvider2FA)
    cache = module.get(Cache)
    usersManager = module.get(UsersManager)
    notificationsManager = module.get(NotificationsManager)
    ;(encryptSecret as jest.Mock).mockImplementation((secret: string) => `encrypted-${secret}`)
    ;(decryptSecret as jest.Mock).mockImplementation((secret: string) => secret.replace('encrypted-', ''))

    const { qrcodeToDataURL } = await import('../../../common/qrcode')
    ;(qrcodeToDataURL as jest.Mock).mockReturnValue('data:image/png;base64,mock')
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('initTwoFactor', () => {
    it('should generate secret and QR code and store in cache', async () => {
      const result = await service.initTwoFactor(mockUser as UserModel)

      expect(result).toHaveProperty('secret')
      expect(result).toHaveProperty('qrDataUrl')
      expect(result.qrDataUrl).toBe('data:image/png;base64,mock')
      expect(cache.set).toHaveBeenCalledWith(`auth-2fa-pending-user-${mockUser.id}`, expect.any(String), 300)
    })
  })

  describe('enableTwoFactor', () => {
    const enableDto: TwoFaVerifyWithPasswordDto = {
      code: '123456',
      password: 'password123',
      isRecoveryCode: false
    }

    it('should throw error if secret has expired', async () => {
      cache.get.mockResolvedValue(null)

      await expect(service.enableTwoFactor(enableDto, mockRequest as FastifyAuthenticatedRequest)).rejects.toThrow(
        new HttpException('The secret has expired', HttpStatus.BAD_REQUEST)
      )
    })

    it('should throw error if verification fails', async () => {
      cache.get.mockResolvedValue('encrypted-secret')
      usersManager.fromUserId.mockResolvedValue(mockUser as UserModel)
      jest.spyOn(service, 'validateTwoFactorCode').mockReturnValue({ success: false, message: 'Invalid code' })

      await expect(service.enableTwoFactor(enableDto, mockRequest as FastifyAuthenticatedRequest)).rejects.toThrow(
        new HttpException('Invalid code', HttpStatus.FORBIDDEN)
      )
    })

    it('should throw error if password is incorrect', async () => {
      cache.get.mockResolvedValue('encrypted-secret')
      usersManager.fromUserId.mockResolvedValue(mockUser as UserModel)
      jest.spyOn(service, 'validateTwoFactorCode').mockReturnValue({ success: true, message: '' })
      usersManager.compareUserPassword.mockResolvedValue(false)

      await expect(service.enableTwoFactor(enableDto, mockRequest as FastifyAuthenticatedRequest)).rejects.toThrow(
        new HttpException('Incorrect code or password', HttpStatus.BAD_REQUEST)
      )
    })

    it('should enable 2FA and return recovery codes on success', async () => {
      cache.get.mockResolvedValue('encrypted-secret')
      usersManager.fromUserId.mockResolvedValue(mockUser as UserModel)
      jest.spyOn(service, 'validateTwoFactorCode').mockReturnValue({ success: true, message: '' })
      usersManager.compareUserPassword.mockResolvedValue(true)

      const result = await service.enableTwoFactor(enableDto, mockRequest as FastifyAuthenticatedRequest)

      expect(result.success).toBe(true)
      expect(result.recoveryCodes).toHaveLength(5)
      expect(usersManager.updateSecrets).toHaveBeenCalledWith(mockUser.id, {
        twoFaSecret: 'encrypted-secret',
        recoveryCodes: expect.any(Array)
      })
      expect(notificationsManager.sendEmailNotification).toHaveBeenCalledWith([mockRequest.user], {
        app: 'auth_2fa',
        event: 'Two-factor authentication (2FA) on your account has been enabled',
        element: 'test-agent',
        url: '127.0.0.1'
      })
    })
  })

  describe('disableTwoFactor', () => {
    const disableDto: TwoFaVerifyWithPasswordDto = {
      code: '123456',
      password: 'password123',
      isRecoveryCode: false
    }

    it('should throw error if verification fails', async () => {
      usersManager.fromUserId.mockResolvedValue(mockUser as UserModel)
      jest.spyOn(service, 'validateTwoFactorCode').mockReturnValue({ success: false, message: 'Invalid code' })

      await expect(service.disableTwoFactor(disableDto, mockRequest as FastifyAuthenticatedRequest)).rejects.toThrow(
        new HttpException('Invalid code', HttpStatus.FORBIDDEN)
      )
    })

    it('should throw error if password is incorrect', async () => {
      usersManager.fromUserId.mockResolvedValue(mockUser as UserModel)
      jest.spyOn(service, 'validateTwoFactorCode').mockReturnValue({ success: true, message: '' })
      usersManager.compareUserPassword.mockResolvedValue(false)

      await expect(service.disableTwoFactor(disableDto, mockRequest as FastifyAuthenticatedRequest)).rejects.toThrow(
        new HttpException('Incorrect code or password', HttpStatus.BAD_REQUEST)
      )
    })

    it('should disable 2FA on success', async () => {
      usersManager.fromUserId.mockResolvedValue(mockUser as UserModel)
      jest.spyOn(service, 'validateTwoFactorCode').mockReturnValue({ success: true, message: '' })
      usersManager.compareUserPassword.mockResolvedValue(true)

      const result = await service.disableTwoFactor(disableDto, mockRequest as FastifyAuthenticatedRequest)

      expect(result.success).toBe(true)
      expect(usersManager.updateSecrets).toHaveBeenCalledWith(mockUser.id, {
        twoFaSecret: undefined,
        recoveryCodes: undefined
      })
      expect(notificationsManager.sendEmailNotification).toHaveBeenCalledWith([mockRequest.user], {
        app: 'auth_2fa',
        event: 'Two-factor authentication (2FA) on your account has been disabled',
        element: 'test-agent',
        url: '127.0.0.1'
      })
    })
  })

  describe('verify', () => {
    const verifyDto: TwoFaVerifyDto = {
      code: '123456',
      isRecoveryCode: false
    }

    it('should verify 2FA code successfully', async () => {
      usersManager.fromUserId.mockResolvedValue(mockUser as UserModel)
      jest.spyOn(service, 'validateTwoFactorCode').mockReturnValue({ success: true, message: '' })

      const result = await service.verify(verifyDto, mockRequest as FastifyAuthenticatedRequest)

      expect(result.success).toBe(true)
      expect(usersManager.updateAccesses).toHaveBeenCalledWith(mockUser, mockRequest.ip, true, true)
    })

    it('should verify recovery code successfully', async () => {
      const recoveryDto: TwoFaVerifyDto = { code: 'code-1', isRecoveryCode: true }
      usersManager.fromUserId.mockResolvedValue(mockUser as UserModel)
      usersManager.updateSecrets.mockResolvedValue(undefined)

      await service.verify(recoveryDto, mockRequest as FastifyAuthenticatedRequest)

      expect(usersManager.updateSecrets).toHaveBeenCalled()
    })

    it('should fail when recovery codes are empty', async () => {
      const recoveryDto: TwoFaVerifyDto = { code: 'code-1', isRecoveryCode: true }
      const userWithoutCodes = { ...mockUser, secrets: { ...mockUser.secrets, recoveryCodes: [] } }
      usersManager.fromUserId.mockResolvedValue(userWithoutCodes as UserModel)

      const result = await service.verify(recoveryDto, mockRequest as FastifyAuthenticatedRequest)

      expect(result.success).toBe(false)
      expect(result.message).toBe('Invalid code')
    })

    it('should fail when recovery code does not match', async () => {
      const recoveryDto: TwoFaVerifyDto = { code: 'wrong-code', isRecoveryCode: true }
      usersManager.fromUserId.mockResolvedValue(mockUser as UserModel)

      const result = await service.verify(recoveryDto, mockRequest as FastifyAuthenticatedRequest)

      expect(result.success).toBe(false)
      expect(result.message).toBe('Invalid code')
    })

    it('should handle errors during recovery code validation', async () => {
      const recoveryDto: TwoFaVerifyDto = { code: 'code-1', isRecoveryCode: true }
      usersManager.fromUserId.mockResolvedValue(mockUser as UserModel)
      usersManager.updateSecrets.mockRejectedValue(new Error())

      const result = await service.verify(recoveryDto, mockRequest as FastifyAuthenticatedRequest)

      expect(result.success).toBe(false)
      expect(result.message).toBe('Invalid code')
    })

    it('should return user when fromLogin is true', async () => {
      usersManager.fromUserId.mockResolvedValue(mockUser as UserModel)
      jest.spyOn(service, 'validateTwoFactorCode').mockReturnValue({ success: true, message: '' })

      const result = await service.verify(verifyDto, mockRequest as FastifyAuthenticatedRequest, true)

      expect(Array.isArray(result)).toBe(true)
      expect(result[0].success).toBe(true)
      expect(result[1]).toBe(mockUser)
    })
  })

  describe('adminResetUserTwoFa', () => {
    it('should reset user 2FA successfully', async () => {
      usersManager.updateSecrets.mockResolvedValue(undefined)

      const result = await service.adminResetUserTwoFa(1)

      expect(result.success).toBe(true)
      expect(usersManager.updateSecrets).toHaveBeenCalledWith(1, {
        twoFaSecret: undefined,
        recoveryCodes: undefined
      })
    })

    it('should handle errors during reset', async () => {
      usersManager.updateSecrets.mockRejectedValue(new Error('Database error'))

      const result = await service.adminResetUserTwoFa(1)

      expect(result.success).toBe(false)
      expect(result.message).toBe('Database error')
    })
  })

  describe('loadUser', () => {
    it('should load and validate user successfully', async () => {
      usersManager.fromUserId.mockResolvedValue(mockUser as UserModel)

      const result = await service.loadUser(1, '127.0.0.1')

      expect(result).toBe(mockUser)
      expect(usersManager.validateUserAccess).toHaveBeenCalledWith(mockUser, '127.0.0.1')
    })

    it('should throw error if user not found', async () => {
      usersManager.fromUserId.mockResolvedValue(null)

      await expect(service.loadUser(1, '127.0.0.1')).rejects.toThrow(new HttpException('User not found', HttpStatus.NOT_FOUND))
    })
  })

  describe('verifyUserPassword', () => {
    it('should verify password successfully', async () => {
      usersManager.compareUserPassword.mockResolvedValue(true)

      await expect(service.verifyUserPassword(mockUser as UserModel, 'password123', '127.0.0.1')).resolves.not.toThrow()
    })

    it('should throw error if password is incorrect', async () => {
      usersManager.compareUserPassword.mockResolvedValue(false)

      await expect(service.verifyUserPassword(mockUser as UserModel, 'wrong-password', '127.0.0.1')).rejects.toThrow(
        new HttpException('Incorrect code or password', HttpStatus.BAD_REQUEST)
      )
      expect(usersManager.updateAccesses).toHaveBeenCalledWith(mockUser, '127.0.0.1', false, true)
    })
  })

  describe('validateTwoFactorCode', () => {
    it('should validate code successfully', () => {
      jest.spyOn(Totp, 'validate').mockReturnValue(true)

      const result = service.validateTwoFactorCode('123456', 'encrypted-secret')

      expect(result.success).toBe(true)
      expect(result.message).toBe('')
    })

    it('should fail validation for incorrect code', () => {
      jest.spyOn(Totp, 'validate').mockReturnValue(false)

      const result = service.validateTwoFactorCode('wrong-code', 'encrypted-secret')

      expect(result.success).toBe(false)
      expect(result.message).toBe('Incorrect code or password')
    })

    it('should return error if secret is not provided', () => {
      const result = service.validateTwoFactorCode('123456', '')

      expect(result.success).toBe(false)
      expect(result.message).toBe('Incorrect code or password')
    })

    it('should handle validation errors', () => {
      jest.spyOn(Totp, 'validate').mockImplementation(() => {
        throw new Error('Validation error')
      })

      const result = service.validateTwoFactorCode('123456', 'encrypted-secret')

      expect(result.success).toBe(false)
      expect(result.message).toBe('Validation error')
    })
  })
})
