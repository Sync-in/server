/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { Client, ClientOptions, Entry, InvalidCredentialsError } from 'ldapts'
import { CONNECT_ERROR_CODE } from '../../../app.constants'
import { USER_ROLE } from '../../../applications/users/constants/user'
import { CreateUserDto, UpdateUserDto } from '../../../applications/users/dto/create-or-update-user.dto'
import { UserModel } from '../../../applications/users/models/user.model'
import { AdminUsersManager } from '../../../applications/users/services/admin-users-manager.service'
import { UsersManager } from '../../../applications/users/services/users-manager.service'
import { comparePassword, splitFullName } from '../../../common/functions'
import { configuration } from '../../../configuration/config.environment'
import { AuthMethod } from '../../models/auth-method'

type LdapUserEntry = Entry & { uid: string; mail: string; cn: string }

@Injectable()
export class AuthMethodLdapService implements AuthMethod {
  private readonly logger = new Logger(AuthMethodLdapService.name)
  private readonly entryAttributes = ['uid', 'mail', 'cn']
  private clientOptions: ClientOptions = { timeout: 6000, connectTimeout: 6000, url: '' }

  constructor(
    private readonly usersManager: UsersManager,
    private readonly adminUsersManager: AdminUsersManager
  ) {}

  async validateUser(loginOrEmail: string, password: string, ip?: string): Promise<UserModel> {
    let user = await this.usersManager.findUser(loginOrEmail, false)
    if (user) {
      if (user.isGuest) {
        // allow guests to be authenticated from db and check if the current user is defined as active
        return this.usersManager.logUser(user, password, ip)
      }
      if (!user.isActive) {
        this.logger.error(`${this.validateUser.name} - user *${user.login}* is locked`)
        throw new HttpException('Account locked', HttpStatus.FORBIDDEN)
      }
    }
    const entry: false | LdapUserEntry = await this.checkAuth(loginOrEmail, password)
    if (entry === false) {
      if (user) {
        this.usersManager.updateAccesses(user, ip, false).catch((e: Error) => this.logger.error(`${this.validateUser.name} : ${e}`))
      }
      return null
    } else if (!entry.mail || !entry.uid) {
      this.logger.error(`${this.validateUser.name} - ${loginOrEmail} : some ldap fields are missing => (${JSON.stringify(entry)})`)
      return null
    }
    const identity = { login: entry.uid, email: entry.mail, password: password, ...splitFullName(entry.cn) } satisfies CreateUserDto
    user = await this.updateOrCreateUser(identity, user)
    this.usersManager.updateAccesses(user, ip, true).catch((e: Error) => this.logger.error(`${this.validateUser.name} : ${e}`))
    return user
  }

  private async checkAuth(uid: string, password: string): Promise<LdapUserEntry | false> {
    const servers = configuration.auth.ldap.servers
    const bindUserDN = `${configuration.auth.ldap.loginAttribute}=${uid},${configuration.auth.ldap.baseDN}`
    let client: Client
    let error: any
    for (const s of servers) {
      client = new Client({ ...this.clientOptions, url: s })
      try {
        await client.bind(bindUserDN, password)
        return await this.checkAccess(client, uid)
      } catch (e) {
        if (e.errors?.length) {
          for (const err of e.errors) {
            this.logger.warn(`${this.checkAuth.name} - ${uid} : ${err}`)
            error = err
          }
        } else {
          error = e
          this.logger.warn(`${this.checkAuth.name} - ${uid} : ${e}`)
        }
        if (error instanceof InvalidCredentialsError) {
          return false
        }
      } finally {
        await client.unbind()
      }
    }
    if (error && CONNECT_ERROR_CODE.has(error.code)) {
      throw new HttpException('Authentication service error', HttpStatus.INTERNAL_SERVER_ERROR)
    }
    return false
  }

  private async checkAccess(client: Client, uid: string): Promise<LdapUserEntry | false> {
    const searchFilter = `(&(${configuration.auth.ldap.loginAttribute}=${uid})${configuration.auth.ldap.filter || ''})`
    try {
      const { searchEntries } = await client.search(configuration.auth.ldap.baseDN, {
        scope: 'sub',
        filter: searchFilter,
        attributes: this.entryAttributes
      })
      for (const entry of searchEntries) {
        if (entry[configuration.auth.ldap.loginAttribute] === uid) {
          if (Array.isArray(entry.mail)) {
            // handles the case of multiple emails, keep the first
            entry.mail = entry.mail[0]
          }
          return entry as LdapUserEntry
        }
      }
      return false
    } catch (e) {
      this.logger.warn(`${this.checkAccess.name} - ${uid} : ${e}`)
      return false
    }
  }

  private async updateOrCreateUser(identity: CreateUserDto, user: UserModel): Promise<UserModel> {
    if (user === null) {
      return this.adminUsersManager.createUserOrGuest(identity, USER_ROLE.USER)
    } else {
      if (identity.login !== user.login) {
        this.logger.error(`${this.updateOrCreateUser.name} - user id mismatch : ${identity.login} !== ${user.login}`)
        throw new HttpException('Account matching error', HttpStatus.FORBIDDEN)
      }
      // check if user information has changed
      const identityHasChanged: UpdateUserDto = Object.fromEntries(
        (
          await Promise.all(
            Object.keys(identity).map(async (key: string) => {
              if (key === 'password') {
                const isSame = await comparePassword(identity[key], user.password)
                return isSame ? null : [key, identity[key]]
              }
              return identity[key] !== user[key] ? [key, identity[key]] : null
            })
          )
        ).filter(Boolean)
      )
      if (Object.keys(identityHasChanged).length > 0) {
        try {
          await this.adminUsersManager.updateUserOrGuest(user.id, identityHasChanged)
          if (identityHasChanged?.password) {
            delete identityHasChanged.password
          }
          Object.assign(user, identityHasChanged)
        } catch (e) {
          this.logger.warn(`${this.updateOrCreateUser.name} - unable to update user *${user.login}* : ${e}`)
        }
      }
      await user.makePaths()
      return user
    }
  }
}
