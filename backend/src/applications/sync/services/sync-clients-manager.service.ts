/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpService } from '@nestjs/axios'
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { AxiosResponse } from 'axios'
import { FastifyReply } from 'fastify'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { AuthMethod } from '../../../authentication/models/auth-method'
import { AuthManager } from '../../../authentication/services/auth-manager.service'
import { AuthMethod2FA } from '../../../authentication/services/auth-methods/auth-method-two-fa.service'
import { convertHumanTimeToSeconds } from '../../../common/functions'
import { currentTimeStamp } from '../../../common/shared'
import { STATIC_PATH } from '../../../configuration/config.constants'
import { configuration } from '../../../configuration/config.environment'
import { CacheDecorator } from '../../../infrastructure/cache/cache.decorator'
import { HTTP_METHOD } from '../../applications.constants'
import { isPathExists } from '../../files/utils/files'
import { USER_PERMISSION } from '../../users/constants/user'
import { UserModel } from '../../users/models/user.model'
import { UsersManager } from '../../users/services/users-manager.service'
import { CLIENT_AUTH_TYPE, CLIENT_TOKEN_EXPIRATION_TIME, CLIENT_TOKEN_EXPIRED_ERROR, CLIENT_TOKEN_RENEW_TIME } from '../constants/auth'
import { APP_STORE_DIRNAME, APP_STORE_MANIFEST_FILE, APP_STORE_REPOSITORY, APP_STORE_URL } from '../constants/store'
import { SYNC_CLIENT_TYPE } from '../constants/sync'
import type { SyncClientAuthDto } from '../dtos/sync-client-auth.dto'
import type { SyncClientRegistrationDto } from '../dtos/sync-client-registration.dto'
import { AppStoreManifest } from '../interfaces/store-manifest.interface'
import { ClientAuthCookieDto, ClientAuthTokenDto } from '../interfaces/sync-client-auth.interface'
import { SyncClientPaths } from '../interfaces/sync-client-paths.interface'
import { SyncClient } from '../schemas/sync-client.interface'
import { SyncQueries } from './sync-queries.service'

@Injectable()
export class SyncClientsManager {
  private readonly logger = new Logger(SyncClientsManager.name)

  constructor(
    private readonly http: HttpService,
    private readonly authManager: AuthManager,
    private readonly authMethod: AuthMethod,
    private readonly authMethod2Fa: AuthMethod2FA,
    private readonly usersManager: UsersManager,
    private readonly syncQueries: SyncQueries
  ) {}

  async register(clientRegistrationDto: SyncClientRegistrationDto, ip: string): Promise<{ clientToken: string }> {
    const user: UserModel = await this.authMethod.validateUser(clientRegistrationDto.login, clientRegistrationDto.password)
    if (!user) {
      this.logger.warn(`${this.register.name} - auth failed for user *${clientRegistrationDto.login}*`)
      throw new HttpException('Wrong login or password', HttpStatus.UNAUTHORIZED)
    }
    if (!user.havePermission(USER_PERMISSION.DESKTOP_APP)) {
      this.logger.warn(`${this.register.name} - user *${user.login}* (${user.id}) does not have permission : ${USER_PERMISSION.DESKTOP_APP}`)
      throw new HttpException('Missing permission', HttpStatus.FORBIDDEN)
    }
    if (configuration.auth.mfa.totp.enabled && user.twoFaEnabled) {
      if (!clientRegistrationDto.code) {
        this.logger.warn(`${this.register.name} - missing two-fa code for user *${user.login}* (${user.id})`)
        throw new HttpException('Missing TWO-FA code', HttpStatus.UNAUTHORIZED)
      }
      const auth = this.authMethod2Fa.validateTwoFactorCode(clientRegistrationDto.code, user.secrets.twoFaSecret)
      if (!auth.success) {
        this.logger.warn(`${this.register.name} - wrong two-fa code for user *${user.login}* (${user.id})`)
        this.usersManager.updateAccesses(user, ip, false).catch((e: Error) => this.logger.error(`${this.register.name} - ${e}`))
        throw new HttpException(auth.message, HttpStatus.UNAUTHORIZED)
      }
    }
    try {
      const token = await this.syncQueries.getOrCreateClient(user.id, clientRegistrationDto.clientId, clientRegistrationDto.info, ip)
      this.logger.log(`${this.register.name} - client *${clientRegistrationDto.info.type}* was registered for user *${user.login}* (${user.id})`)
      return { clientToken: token }
    } catch (e) {
      this.logger.error(`${this.register.name} - ${e}`)
      throw new HttpException('Error during the client registration', HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  async unregister(user: UserModel): Promise<void> {
    try {
      await this.syncQueries.deleteClient(user.id, user.clientId)
    } catch (e) {
      this.logger.error(`${this.unregister.name} - ${e}`)
      throw new HttpException('Error during the removing of client registration', HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  async authenticate(
    authType: CLIENT_AUTH_TYPE,
    syncClientAuthDto: SyncClientAuthDto,
    ip: string,
    res: FastifyReply
  ): Promise<ClientAuthTokenDto | ClientAuthCookieDto> {
    const client = await this.syncQueries.getClient(syncClientAuthDto.clientId, null, syncClientAuthDto.token)
    if (!client) {
      throw new HttpException('Client is unknown', HttpStatus.FORBIDDEN)
    }
    if (!client.enabled) {
      throw new HttpException('Client is disabled', HttpStatus.FORBIDDEN)
    }
    if (currentTimeStamp() >= client.tokenExpiration) {
      throw new HttpException(CLIENT_TOKEN_EXPIRED_ERROR, HttpStatus.FORBIDDEN)
    }
    this.syncQueries.updateClientInfo(client, client.info, ip).catch((e: Error) => this.logger.error(`${this.authenticate.name} - ${e}`))
    const user: UserModel = await this.usersManager.fromUserId(client.ownerId)
    if (!user) {
      throw new HttpException('User does not exist', HttpStatus.FORBIDDEN)
    }
    if (!user.isActive) {
      throw new HttpException('Account suspended or not authorized', HttpStatus.FORBIDDEN)
    }
    if (!user.havePermission(USER_PERMISSION.DESKTOP_APP)) {
      this.logger.warn(`${this.register.name} - does not have permission : ${USER_PERMISSION.DESKTOP_APP}`)
      throw new HttpException('Missing permission', HttpStatus.FORBIDDEN)
    }
    // set clientId
    user.clientId = client.id
    // update accesses
    this.usersManager.updateAccesses(user, ip, true).catch((e: Error) => this.logger.error(`${this.authenticate.name} - ${e}`))
    let r: ClientAuthTokenDto | ClientAuthCookieDto
    if (authType === CLIENT_AUTH_TYPE.COOKIE) {
      // used by the desktop app to perform the login setup using cookies
      r = await this.authManager.setCookies(user, res)
    } else if (authType === CLIENT_AUTH_TYPE.TOKEN) {
      // used by the cli app and the sync core
      r = await this.authManager.getTokens(user)
    }
    // check if the client token must be updated
    r.client_token_update = await this.renewTokenAndExpiration(client, user)
    return r
  }

  getClients(user: UserModel): Promise<SyncClientPaths[]> {
    return this.syncQueries.getClients(user)
  }

  async renewTokenAndExpiration(client: SyncClient, owner: UserModel): Promise<string | undefined> {
    if (currentTimeStamp() + convertHumanTimeToSeconds(CLIENT_TOKEN_RENEW_TIME) < client.tokenExpiration) {
      // client token expiration is not close enough
      return undefined
    }
    const token = crypto.randomUUID()
    const expiration = currentTimeStamp() + convertHumanTimeToSeconds(CLIENT_TOKEN_EXPIRATION_TIME)
    this.logger.log(`${this.renewTokenAndExpiration.name} - renew token for user *${owner.login}* and client *${client.id}*`)
    try {
      await this.syncQueries.renewClientTokenAndExpiration(client.id, token, expiration)
    } catch (e) {
      this.logger.error(`${this.renewTokenAndExpiration.name} - unable to renew token for user *${owner.login}* and client *${client.id}* : ${e}`)
      throw new HttpException('Unable to update client token', HttpStatus.BAD_REQUEST)
    }
    return token
  }

  async deleteClient(user: UserModel, clientId: string): Promise<void> {
    try {
      await this.syncQueries.deleteClient(user.id, clientId)
    } catch (e) {
      this.logger.error(`${this.deleteClient.name} - ${e}`)
      throw new HttpException('Unable to delete client', HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  @CacheDecorator(3600)
  async checkAppStore(): Promise<AppStoreManifest> {
    let manifest: AppStoreManifest = null
    if (configuration.applications.appStore.repository === APP_STORE_REPOSITORY.PUBLIC) {
      const url = `${APP_STORE_URL}/${APP_STORE_MANIFEST_FILE}`
      try {
        const res: AxiosResponse = await this.http.axiosRef({
          method: HTTP_METHOD.GET,
          url: url
        })
        manifest = res.data
        manifest.repository = APP_STORE_REPOSITORY.PUBLIC
      } catch (e) {
        this.logger.warn(`${this.checkAppStore.name} - unable to retrieve ${url} : ${e}`)
      }
    } else {
      const latestFile = path.join(STATIC_PATH, APP_STORE_DIRNAME, APP_STORE_MANIFEST_FILE)
      if (!(await isPathExists(latestFile))) {
        this.logger.warn(`${this.checkAppStore.name} - ${latestFile} does not exist`)
      } else {
        try {
          manifest = JSON.parse(await fs.readFile(latestFile, 'utf8'))
          manifest.repository = APP_STORE_REPOSITORY.LOCAL
          // rewrite urls to local repository
          for (const [os, packages] of Object.entries(manifest.platform)) {
            for (const p of packages) {
              if (p.package.toLowerCase().startsWith(SYNC_CLIENT_TYPE.DESKTOP)) {
                p.url = `${APP_STORE_DIRNAME}/${SYNC_CLIENT_TYPE.DESKTOP}/${os}/${p.package}`
              } else {
                p.url = `${APP_STORE_DIRNAME}/${SYNC_CLIENT_TYPE.CLI}/${p.package}`
              }
            }
          }
        } catch (e) {
          this.logger.error(`${this.checkAppStore.name} - ${latestFile} : ${e}`)
        }
      }
    }
    return manifest
  }
}
