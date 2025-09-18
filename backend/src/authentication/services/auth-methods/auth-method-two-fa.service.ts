/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { Totp } from 'time2fa'
import { NOTIFICATION_APP, NOTIFICATION_APP_EVENT } from '../../../applications/notifications/constants/notifications'
import { NotificationContent } from '../../../applications/notifications/interfaces/notification-properties.interface'
import { NotificationsManager } from '../../../applications/notifications/services/notifications-manager.service'
import { UserPasswordDto } from '../../../applications/users/dto/user-properties.dto'
import { UserModel } from '../../../applications/users/models/user.model'
import { UsersManager } from '../../../applications/users/services/users-manager.service'
import { ACTION } from '../../../common/constants'
import { generateShortUUID } from '../../../common/functions'
import { qrcodeToDataURL } from '../../../common/qrcode'
import { configuration } from '../../../configuration/config.environment'
import { Cache } from '../../../infrastructure/cache/services/cache.service'
import { TWO_FA_CODE_LENGTH } from '../../constants/auth'
import { TwoFaVerifyDto } from '../../dto/two-fa-verify.dto'
import { FastifyAuthenticatedRequest } from '../../interfaces/auth-request.interface'
import { TwoFaEnableResult, TwoFaSetup, TwoFaVerifyResult } from '../../interfaces/two-fa-setup.interface'
import { decryptSecret, encryptSecret } from '../../utils/crypt-secret'

@Injectable()
export class AuthMethod2FA {
  private readonly logger = new Logger(AuthMethod2FA.name)
  private readonly cacheKeyPrefix = 'auth-2fa-pending-user-'

  constructor(
    private readonly cache: Cache,
    private readonly usersManager: UsersManager,
    private readonly notificationsManager: NotificationsManager
  ) {}

  async initTwoFactor(user: UserModel): Promise<TwoFaSetup> {
    const { secret, qrDataUrl } = this.generateSecretAndQr(user.email)
    // store encrypted secret in cache for 5mn
    await this.cache.set(this.getCacheKey(user.id), this.encryptSecret(secret), 300)
    return { secret, qrDataUrl }
  }

  async enableTwoFactor(body: TwoFaVerifyDto, req: FastifyAuthenticatedRequest): Promise<TwoFaEnableResult> {
    // retrieve encrypted secret from cache
    const secret: string = await this.cache.get(this.getCacheKey(req.user.id))
    if (!secret) {
      throw new HttpException('The secret has expired', HttpStatus.BAD_REQUEST)
    }
    // verify code with secret
    const auth = this.validateTwoFactorCode(body.code, secret)
    if (!auth.success) {
      throw new HttpException(auth.message, HttpStatus.BAD_REQUEST)
    }
    // generate recovery codes
    const recoveryCodes = this.generateRecoveryCodes()
    // store and enable TwoFA & recovery codes
    await this.usersManager.updateSecrets(req.user.id, {
      twoFaSecret: secret,
      recoveryCodes: recoveryCodes.map((code) => this.encryptSecret(code))
    })
    this.sendEmailNotification(req, ACTION.ADD)
    return { ...auth, recoveryCodes: recoveryCodes }
  }

  async disableTwoFactor(body: TwoFaVerifyDto, req: FastifyAuthenticatedRequest): Promise<TwoFaVerifyResult> {
    const auth = await this.verify(body, req)
    if (!auth.success) {
      throw new HttpException(auth.message, HttpStatus.FORBIDDEN)
    }
    // store and disable TwoFA & recovery codes
    await this.usersManager.updateSecrets(req.user.id, { twoFaSecret: undefined, recoveryCodes: undefined })
    this.sendEmailNotification(req, ACTION.DELETE)
    return auth
  }

  async verify(body: TwoFaVerifyDto, req: FastifyAuthenticatedRequest, fromLogin?: false): Promise<TwoFaVerifyResult>
  async verify(body: TwoFaVerifyDto, req: FastifyAuthenticatedRequest, fromLogin: true): Promise<[TwoFaVerifyResult, UserModel]>
  async verify(
    verifyDto: TwoFaVerifyDto,
    req: FastifyAuthenticatedRequest,
    fromLogin = false
  ): Promise<TwoFaVerifyResult | [TwoFaVerifyResult, UserModel]> {
    const code = verifyDto.code
    const user = await this.usersManager.fromUserId(req.user.id)
    if (!user) {
      this.logger.warn(`User *${user.login}* (${user.id}) not found`)
      throw new HttpException(`User not found`, HttpStatus.NOT_FOUND)
    }
    this.usersManager.validateUserAccess(user, req.ip)
    const auth = verifyDto.isRecoveryCode
      ? await this.validateRecoveryCode(req.user.id, code, user.secrets.recoveryCodes)
      : this.validateTwoFactorCode(code, user.secrets.twoFaSecret)
    this.usersManager.updateAccesses(user, req.ip, auth.success, true).catch((e: Error) => this.logger.error(`${this.verify.name} - ${e}`))
    return fromLogin ? [auth, user] : auth
  }

  async adminResetUserTwoFa(adminId: number, userId: number, adminPassword: UserPasswordDto) {
    // check admin password
    const auth: TwoFaVerifyResult = { success: false, message: '' }
    if (!(await this.usersManager.usersQueries.compareUserPassword(adminId, adminPassword.password))) {
      auth.message = 'Bad password'
      return auth
    }
    await this.usersManager.updateSecrets(userId, { twoFaSecret: undefined, recoveryCodes: undefined })
    auth.success = true
    return auth
  }

  private validateTwoFactorCode(code: string, encryptedSecret: string): TwoFaVerifyResult {
    const auth: TwoFaVerifyResult = { success: false, message: '' }
    try {
      auth.success = Totp.validate({ passcode: code, secret: this.decryptSecret(encryptedSecret), drift: 1 })
      if (!auth.success) auth.message = 'Invalid code'
    } catch (e) {
      this.logger.error(`${this.validateTwoFactorCode.name} - ${e}`)
      auth.message = e.message
    }
    return auth
  }

  private async validateRecoveryCode(userId: number, code: string, encryptedCodes: string[]): Promise<TwoFaVerifyResult> {
    const auth: TwoFaVerifyResult = { success: false, message: '' }
    if (!encryptedCodes || encryptedCodes.length === 0) {
      auth.message = 'Invalid code'
    } else {
      try {
        for (const encCode of encryptedCodes) {
          if (code === this.decryptSecret(encCode)) {
            auth.success = true
            // removed used code
            encryptedCodes.splice(encryptedCodes.indexOf(encCode), 1)
            break
          }
        }
        if (auth.success) {
          // update recovery codes
          await this.usersManager.updateSecrets(userId, { recoveryCodes: encryptedCodes })
        } else {
          auth.message = 'Invalid code'
        }
      } catch (e) {
        this.logger.error(`${this.validateRecoveryCode.name} - ${e}`)
        auth.message = e.message
      }
    }
    return auth
  }

  private generateSecretAndQr(userEmail: string): TwoFaSetup {
    // Generate secret + otpauth URL + QR (DataURL)
    // Totp.generateKey returns { issuer, user, config, secret, url }
    const key = Totp.generateKey({ issuer: configuration.auth.mfa.totp.issuer, user: userEmail }, { digits: TWO_FA_CODE_LENGTH })
    const qrDataUrl = qrcodeToDataURL(key.url)
    return { secret: key.secret, qrDataUrl: qrDataUrl }
  }

  private getCacheKey(userId: number): string {
    return `${this.cacheKeyPrefix}${userId}`
  }

  private encryptSecret(secret: string): string {
    if (configuration.auth.encryptionKey) {
      return encryptSecret(secret, configuration.auth.encryptionKey)
    }
    return secret
  }

  private decryptSecret(secret: string): string {
    if (configuration.auth.encryptionKey) {
      return decryptSecret(secret, configuration.auth.encryptionKey)
    }
    return secret
  }

  private generateRecoveryCodes(count = 5): string[] {
    return Array.from({ length: count }, () => generateShortUUID())
  }

  private sendEmailNotification(req: FastifyAuthenticatedRequest, action: ACTION) {
    const notification: NotificationContent = {
      app: NOTIFICATION_APP.AUTH_2FA,
      event: NOTIFICATION_APP_EVENT.AUTH_2FA[action],
      element: req.headers['user-agent'],
      url: req.ip
    }
    this.notificationsManager
      .sendEmailNotification([req.user], notification)
      .catch((e: Error) => this.logger.error(`${this.sendEmailNotification.name} - ${e}`))
  }
}
