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
import { UserModel } from '../../../applications/users/models/user.model'
import { UsersManager } from '../../../applications/users/services/users-manager.service'
import { ACTION } from '../../../common/constants'
import { generateShortUUID } from '../../../common/functions'
import { qrcodeToDataURL } from '../../../common/qrcode'
import { configuration } from '../../../configuration/config.environment'
import { Cache } from '../../../infrastructure/cache/services/cache.service'
import { TWO_FA_CODE_LENGTH } from '../../constants/auth'
import { FastifyAuthenticatedRequest } from '../../interfaces/auth-request.interface'
import { decryptSecret, encryptSecret } from '../../utils/crypt-secret'
import { TwoFaVerifyDto, TwoFaVerifyWithPasswordDto } from './auth-two-fa.dtos'
import { TwoFaEnableResult, TwoFaSetup, TwoFaVerifyResult } from './auth-two-fa.interfaces'

@Injectable()
export class AuthProvider2FA {
  private readonly logger = new Logger(AuthProvider2FA.name)
  private readonly cacheKeyPrefix = 'auth-2fa-pending-user-'

  constructor(
    private readonly cache: Cache,
    private readonly usersManager: UsersManager,
    private readonly notificationsManager: NotificationsManager
  ) {}

  async initTwoFactor(user: UserModel): Promise<TwoFaSetup> {
    const { secret, qrDataUrl } = this.generateSecretAndQr(user.email)
    // store encrypted secret in cache for 5 minutes
    await this.cache.set(this.getCacheKey(user.id), this.encryptSecret(secret), 300)
    return { secret, qrDataUrl }
  }

  async enableTwoFactor(body: TwoFaVerifyWithPasswordDto, req: FastifyAuthenticatedRequest): Promise<TwoFaEnableResult> {
    // retrieve encrypted secret from cache
    const secret: string = await this.cache.get(this.getCacheKey(req.user.id))
    if (!secret) {
      throw new HttpException('The secret has expired', HttpStatus.BAD_REQUEST)
    }
    // load user
    const [auth, user] = await this.verify(body, req, true, secret)
    if (!auth.success) {
      throw new HttpException(auth.message, HttpStatus.FORBIDDEN)
    }
    // verify user password
    await this.verifyUserPassword(user, body.password, req.ip)
    // generate recovery codes
    const recoveryCodes = this.generateRecoveryCodes()
    // store and enable TwoFA & recovery codes
    await this.usersManager.updateSecrets(user.id, {
      twoFaSecret: secret,
      recoveryCodes: recoveryCodes.map((code) => this.encryptSecret(code))
    })
    this.sendEmailNotification(req, ACTION.ADD)
    return { ...auth, recoveryCodes: recoveryCodes }
  }

  async disableTwoFactor(body: TwoFaVerifyWithPasswordDto, req: FastifyAuthenticatedRequest): Promise<TwoFaVerifyResult> {
    // load user
    const [auth, user] = await this.verify(body, req, true)
    if (!auth.success) {
      throw new HttpException(auth.message, HttpStatus.FORBIDDEN)
    }
    // verify user password
    await this.verifyUserPassword(user, body.password, req.ip)
    // store and disable TwoFA & recovery codes
    await this.usersManager.updateSecrets(user.id, { twoFaSecret: undefined, recoveryCodes: undefined })
    this.sendEmailNotification(req, ACTION.DELETE)
    return auth
  }

  async verify(verifyDto: TwoFaVerifyDto, req: FastifyAuthenticatedRequest, fromLogin?: false, secret?: string): Promise<TwoFaVerifyResult>
  async verify(verifyDto: TwoFaVerifyDto, req: FastifyAuthenticatedRequest, fromLogin: true, secret?: string): Promise<[TwoFaVerifyResult, UserModel]>
  async verify(
    verifyDto: TwoFaVerifyDto,
    req: FastifyAuthenticatedRequest,
    fromLogin = false,
    secret?: string
  ): Promise<TwoFaVerifyResult | [TwoFaVerifyResult, UserModel]> {
    const user = await this.loadUser(req.user.id, req.ip)
    secret = secret || user.secrets.twoFaSecret
    const auth = verifyDto.isRecoveryCode
      ? await this.validateRecoveryCode(req.user.id, verifyDto.code, user.secrets.recoveryCodes)
      : this.validateTwoFactorCode(verifyDto.code, secret)
    this.usersManager.updateAccesses(user, req.ip, auth.success, true).catch((e: Error) => this.logger.error(`${this.verify.name} - ${e}`))
    return fromLogin ? [auth, user] : auth
  }

  async adminResetUserTwoFa(userId: number) {
    const auth: TwoFaVerifyResult = { success: false, message: '' }
    try {
      await this.usersManager.updateSecrets(userId, { twoFaSecret: undefined, recoveryCodes: undefined })
      auth.success = true
    } catch (e) {
      auth.success = false
      auth.message = e.message
      this.logger.error(`${this.adminResetUserTwoFa.name} - ${e}`)
    }
    return auth
  }

  async loadUser(userId: number, ip: string) {
    const user: UserModel = await this.usersManager.fromUserId(userId)
    if (!user) {
      this.logger.warn(`User ${userId} (${ip}) not found`)
      throw new HttpException(`User not found`, HttpStatus.NOT_FOUND)
    }
    this.usersManager.validateUserAccess(user, ip)
    return user
  }

  async verifyUserPassword(user: UserModel, password: string, ip: string) {
    // This function works with any authentication method, provided that
    // the authentication service implements proper user password updates in the database.
    if (!(await this.usersManager.compareUserPassword(user.id, password))) {
      this.usersManager.updateAccesses(user, ip, false, true).catch((e: Error) => this.logger.error(`${this.enableTwoFactor.name} - ${e}`))
      throw new HttpException('Incorrect code or password', HttpStatus.BAD_REQUEST)
    }
  }

  validateTwoFactorCode(code: string, encryptedSecret: string): TwoFaVerifyResult {
    const auth: TwoFaVerifyResult = { success: false, message: '' }
    if (!encryptedSecret) {
      auth.message = 'Incorrect code or password'
      return auth
    }
    try {
      auth.success = Totp.validate({ passcode: code, secret: this.decryptSecret(encryptedSecret), drift: 1 })
      if (!auth.success) auth.message = 'Incorrect code or password'
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
