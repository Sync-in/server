/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { Client, ClientOptions, Entry, InvalidCredentialsError } from 'ldapts'
import { CONNECT_ERROR_CODE } from '../../../app.constants'
import { USER_ROLE } from '../../../applications/users/constants/user'
import type { CreateUserDto, UpdateUserDto } from '../../../applications/users/dto/create-or-update-user.dto'
import { UserModel } from '../../../applications/users/models/user.model'
import { AdminUsersManager } from '../../../applications/users/services/admin-users-manager.service'
import { UsersManager } from '../../../applications/users/services/users-manager.service'
import { comparePassword, splitFullName } from '../../../common/functions'
import { configuration } from '../../../configuration/config.environment'
import type { AUTH_SCOPE } from '../../constants/scope'
import { AuthMethod } from '../../models/auth-method'

const LDAP_ATTRIBUTES = {
  AD: {
    SAM_ACCOUNT: 'sAMAccountName',
    USER_NAME: 'userPrincipalName'
  },
  LDAP: {
    UID: 'uid'
  },
  COMMON: {
    MAIL: 'mail',
    GIVEN_NAME: 'givenName',
    SN: 'sn',
    CN: 'cn',
    DISPLAY_NAME: 'displayName'
  }
} as const

const ALL_ATTRIBUTES = [...Object.values(LDAP_ATTRIBUTES.COMMON), ...Object.values(LDAP_ATTRIBUTES.LDAP), ...Object.values(LDAP_ATTRIBUTES.AD)]

type KnownAttr =
  | (typeof LDAP_ATTRIBUTES.AD)[keyof typeof LDAP_ATTRIBUTES.AD]
  | (typeof LDAP_ATTRIBUTES.LDAP)[keyof typeof LDAP_ATTRIBUTES.LDAP]
  | (typeof LDAP_ATTRIBUTES.COMMON)[keyof typeof LDAP_ATTRIBUTES.COMMON]

type LdapUserEntry = Entry & Record<KnownAttr | string, string>

@Injectable()
export class AuthMethodLdapService implements AuthMethod {
  private readonly logger = new Logger(AuthMethodLdapService.name)
  private clientOptions: ClientOptions = { timeout: 6000, connectTimeout: 6000, url: '' }

  constructor(
    private readonly usersManager: UsersManager,
    private readonly adminUsersManager: AdminUsersManager
  ) {}

  async validateUser(login: string, password: string, ip?: string, scope?: AUTH_SCOPE): Promise<UserModel> {
    login = this.getUserLogin(login)
    let user: UserModel = await this.usersManager.findUser(login, false)
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
    const entry: false | LdapUserEntry = await this.checkAuth(login, password)
    if (entry === false) {
      // LDAP auth failed
      if (user) {
        let authSuccess = false
        if (scope) {
          // try user app password
          authSuccess = await this.usersManager.validateAppPassword(user, password, ip, scope)
        }
        this.usersManager.updateAccesses(user, ip, authSuccess).catch((e: Error) => this.logger.error(`${this.validateUser.name} : ${e}`))
        if (authSuccess) {
          // logged with app password
          return user
        }
      }
      return null
    } else if (!entry[configuration.auth.ldap.attributes.login] || !entry[configuration.auth.ldap.attributes.email]) {
      this.logger.error(`${this.validateUser.name} - required ldap fields are missing : 
      [${configuration.auth.ldap.attributes.login}, ${configuration.auth.ldap.attributes.email}] => 
      (${JSON.stringify(entry)})`)
      return null
    }
    const identity = this.createIdentity(entry, password)
    user = await this.updateOrCreateUser(identity, user)
    this.usersManager.updateAccesses(user, ip, true).catch((e: Error) => this.logger.error(`${this.validateUser.name} : ${e}`))
    return user
  }

  private async checkAuth(uid: string, password: string): Promise<LdapUserEntry | false> {
    const servers = configuration.auth.ldap.servers
    const loginAttr = configuration.auth.ldap.attributes.login
    const baseDN = configuration.auth.ldap.baseDN
    const bindUserDN = (Object.values(LDAP_ATTRIBUTES.AD) as string[]).indexOf(loginAttr) > -1 ? loginAttr : `${loginAttr}=${uid},${baseDN}`
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
    const searchFilter = `(&(${configuration.auth.ldap.attributes.login}=${uid})${configuration.auth.ldap.filter || ''})`
    try {
      const { searchEntries } = await client.search(configuration.auth.ldap.baseDN, {
        scope: 'sub',
        filter: searchFilter,
        attributes: ALL_ATTRIBUTES
      })
      for (const entry of searchEntries) {
        if (entry[configuration.auth.ldap.attributes.login] === uid) {
          return this.convertToLdapUserEntry(entry)
        }
      }
      this.logger.warn(`${this.checkAuth.name} - unable to find user id : ${uid}`)
      return false
    } catch (e) {
      this.logger.error(`${this.checkAccess.name} - ${uid} : ${e}`)
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
          if ('lastName' in identityHasChanged || 'firstName' in identityHasChanged) {
            // force fullName update
            user.setFullName(true)
          }
        } catch (e) {
          this.logger.warn(`${this.updateOrCreateUser.name} - unable to update user *${user.login}* : ${e}`)
        }
      }
      await user.makePaths()
      return user
    }
  }

  private convertToLdapUserEntry(entry: Entry): LdapUserEntry {
    for (const attr of ALL_ATTRIBUTES) {
      if (Array.isArray(entry[attr])) {
        entry[attr] = entry[attr].length > 0 ? entry[attr][0] : null
      }
    }
    return entry as LdapUserEntry
  }

  private createIdentity(entry: LdapUserEntry, password: string): CreateUserDto {
    return {
      login: this.getUserLogin(entry[configuration.auth.ldap.attributes.login]),
      email: entry[configuration.auth.ldap.attributes.email],
      password: password,
      ...this.getFirstNameAndLastName(entry)
    } satisfies CreateUserDto
  }

  private getFirstNameAndLastName(entry: LdapUserEntry): { firstName: string; lastName: string } {
    // 1) Prefer structured attributes
    if (entry.sn && entry.givenName) {
      return { firstName: entry.givenName, lastName: entry.sn }
    }
    // 2) Fallback to displayName if available
    if (entry.displayName && entry.displayName.trim()) {
      return splitFullName(entry.displayName)
    }
    // 3) Fallback to cn
    if (entry.cn && entry.cn.trim()) {
      return splitFullName(entry.cn)
    }
    // 4) Nothing usable
    return { firstName: '', lastName: '' }
  }

  private getUserLogin(login: string): string {
    if (configuration.auth.ldap.attributes.login === LDAP_ATTRIBUTES.AD.USER_NAME) {
      return login.split('@')[0]
    } else if (configuration.auth.ldap.attributes.login === LDAP_ATTRIBUTES.AD.SAM_ACCOUNT) {
      return login.split('\\')[0]
    }
    return login
  }
}
