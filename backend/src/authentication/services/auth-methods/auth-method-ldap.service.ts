/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { AndFilter, Client, ClientOptions, Entry, EqualityFilter, InvalidCredentialsError } from 'ldapts'
import { CONNECT_ERROR_CODE } from '../../../app.constants'
import { USER_ROLE } from '../../../applications/users/constants/user'
import type { CreateUserDto, UpdateUserDto } from '../../../applications/users/dto/create-or-update-user.dto'
import { UserModel } from '../../../applications/users/models/user.model'
import { AdminUsersManager } from '../../../applications/users/services/admin-users-manager.service'
import { UsersManager } from '../../../applications/users/services/users-manager.service'
import { comparePassword, splitFullName } from '../../../common/functions'
import { configuration } from '../../../configuration/config.environment'
import { ALL_LDAP_ATTRIBUTES, LDAP_COMMON_ATTR, LDAP_LOGIN_ATTR } from '../../constants/auth-ldap'
import type { AUTH_SCOPE } from '../../constants/scope'
import { AuthMethod } from '../../models/auth-method'

type LdapUserEntry = Entry & Record<LDAP_LOGIN_ATTR | (typeof LDAP_COMMON_ATTR)[keyof typeof LDAP_COMMON_ATTR], string>

@Injectable()
export class AuthMethodLdapService implements AuthMethod {
  private readonly logger = new Logger(AuthMethodLdapService.name)
  private readonly loginAttribute: LDAP_LOGIN_ATTR = configuration.auth.ldap.attributes.login
  private readonly emailAttribute: string = configuration.auth.ldap.attributes.email
  private readonly servers: string[] = configuration.auth.ldap.servers
  private readonly baseDN: string = configuration.auth.ldap.baseDN
  private readonly filter: string = configuration.auth.ldap.filter
  private clientOptions: ClientOptions = { timeout: 6000, connectTimeout: 6000, url: '' }

  constructor(
    private readonly usersManager: UsersManager,
    private readonly adminUsersManager: AdminUsersManager
  ) {}

  async validateUser(login: string, password: string, ip?: string, scope?: AUTH_SCOPE): Promise<UserModel> {
    let user: UserModel = await this.usersManager.findUser(this.normalizeLogin(login), false)
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
    } else if (!entry[this.loginAttribute] || !entry[this.emailAttribute]) {
      this.logger.error(`${this.validateUser.name} - required ldap fields are missing : 
      [${this.loginAttribute}, ${this.emailAttribute}] => 
      (${JSON.stringify(entry)})`)
      return null
    }
    const identity = this.createIdentity(entry, password)
    user = await this.updateOrCreateUser(identity, user)
    this.usersManager.updateAccesses(user, ip, true).catch((e: Error) => this.logger.error(`${this.validateUser.name} : ${e}`))
    return user
  }

  private async checkAuth(login: string, password: string): Promise<LdapUserEntry | false> {
    const loginAttr = this.loginAttribute
    const isAD = loginAttr === LDAP_LOGIN_ATTR.SAM || loginAttr === LDAP_LOGIN_ATTR.UPN
    // AD: bind directly with the user input (UPN or DOMAIN\user)
    // Generic LDAP: build DN from login attribute + baseDN
    const bindUserDN = isAD ? login : `${loginAttr}=${login},${this.baseDN}`
    let client: Client
    let error: any
    for (const s of this.servers) {
      client = new Client({ ...this.clientOptions, url: s })
      try {
        await client.bind(bindUserDN, password)
        return await this.checkAccess(client, login)
      } catch (e) {
        if (e.errors?.length) {
          for (const err of e.errors) {
            this.logger.warn(`${this.checkAuth.name} - ${login} : ${err}`)
            error = err
          }
        } else {
          error = e
          this.logger.warn(`${this.checkAuth.name} - ${login} : ${e}`)
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

  private async checkAccess(client: Client, login: string): Promise<LdapUserEntry | false> {
    const searchFilter = this.buildUserFilter(login, this.filter)
    try {
      const { searchEntries } = await client.search(this.baseDN, {
        scope: 'sub',
        filter: searchFilter,
        attributes: ALL_LDAP_ATTRIBUTES
      })

      if (searchEntries.length === 0) {
        this.logger.debug(`${this.checkAccess.name} - search filter : ${searchFilter}`)
        this.logger.warn(`${this.checkAccess.name} - no LDAP entry found for : ${login}`)
        return false
      }

      if (searchEntries.length > 1) {
        this.logger.warn(`${this.checkAccess.name} - multiple LDAP entries found for : ${login}, using first one`)
      }

      // Always return the first valid entry
      return this.convertToLdapUserEntry(searchEntries[0])
    } catch (e) {
      this.logger.debug(`${this.checkAccess.name} - search filter : ${searchFilter}`)
      this.logger.error(`${this.checkAccess.name} - ${login} : ${e}`)
      return false
    }
  }

  private async updateOrCreateUser(identity: CreateUserDto, user: UserModel): Promise<UserModel> {
    if (user === null) {
      const createdUser = await this.adminUsersManager.createUserOrGuest(identity, USER_ROLE.USER)
      const freshUser = await this.usersManager.fromUserId(createdUser.id)
      if (!freshUser) {
        this.logger.error(`${this.updateOrCreateUser.name} - user was not found : ${createdUser.login} (${createdUser.id})`)
        throw new HttpException('User not found', HttpStatus.NOT_FOUND)
      }
      return freshUser
    }
    if (identity.login !== user.login) {
      this.logger.error(`${this.updateOrCreateUser.name} - user login mismatch : ${identity.login} !== ${user.login}`)
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
          // force fullName update in current user model
          user.setFullName(true)
        }
      } catch (e) {
        this.logger.warn(`${this.updateOrCreateUser.name} - unable to update user *${user.login}* : ${e}`)
      }
    }
    return user
  }

  private convertToLdapUserEntry(entry: Entry): LdapUserEntry {
    for (const attr of ALL_LDAP_ATTRIBUTES) {
      if (Array.isArray(entry[attr])) {
        entry[attr] = entry[attr].length > 0 ? entry[attr][0] : null
      }
    }
    return entry as LdapUserEntry
  }

  private createIdentity(entry: LdapUserEntry, password: string): CreateUserDto {
    return {
      login: this.normalizeLogin(entry[this.loginAttribute]),
      email: entry[this.emailAttribute] as string,
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

  private normalizeLogin(login: string, toLowerCase = true): string {
    const normalized = (login.includes('\\') ? login.split('\\').slice(-1)[0] : login).trim()
    return toLowerCase ? normalized.toLowerCase() : normalized
  }

  private buildUserFilter(login: string, extraFilter?: string): string {
    // Build a safe LDAP filter to search for a user.
    // Important: - Values passed to EqualityFilter are auto-escaped by ldapts
    //            - extraFilter is appended as-is (assumed trusted configuration)
    // Output: (&(|(userPrincipalName=john.doe)(sAMAccountName=john.doe)(uid=john.doe))(*extraFilter*))

    // OR clause: accept UPN, sAMAccountName, or uid
    const normalizedLogin = this.normalizeLogin(login, false)

    const eq = new EqualityFilter({ attribute: this.loginAttribute, value: normalizedLogin })
    // Convert to LDAP filter string
    let filterString = new AndFilter({ filters: [eq] }).toString()

    // Optionally append an extra filter from config (trusted source)
    if (extraFilter && extraFilter.trim()) {
      filterString = `(&${filterString}${extraFilter})`
    }
    return filterString
  }
}
