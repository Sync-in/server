/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { AndFilter, Client, ClientOptions, Entry, EqualityFilter, InvalidCredentialsError, OrFilter } from 'ldapts'
import { CONNECT_ERROR_CODE } from '../../../app.constants'
import { USER_ROLE } from '../../../applications/users/constants/user'
import type { CreateUserDto, UpdateUserDto } from '../../../applications/users/dto/create-or-update-user.dto'
import { UserModel } from '../../../applications/users/models/user.model'
import { AdminUsersManager } from '../../../applications/users/services/admin-users-manager.service'
import { UsersManager } from '../../../applications/users/services/users-manager.service'
import { comparePassword, splitFullName } from '../../../common/functions'
import { configuration } from '../../../configuration/config.environment'
import type { AUTH_SCOPE } from '../../constants/scope'
import { AuthProvider } from '../auth-providers.models'
import { ALL_LDAP_ATTRIBUTES, LDAP_COMMON_ATTR, LDAP_LOGIN_ATTR } from './auth-ldap.constants'

type LdapUserEntry = Entry & Record<LDAP_LOGIN_ATTR | (typeof LDAP_COMMON_ATTR)[keyof typeof LDAP_COMMON_ATTR], string>

@Injectable()
export class AuthProviderLDAP implements AuthProvider {
  private readonly logger = new Logger(AuthProviderLDAP.name)
  private readonly ldapConfig = configuration.auth.ldap
  private readonly isAD = this.ldapConfig.attributes.login === LDAP_LOGIN_ATTR.SAM || this.ldapConfig.attributes.login === LDAP_LOGIN_ATTR.UPN
  private clientOptions: ClientOptions = { timeout: 6000, connectTimeout: 6000, url: '' }

  constructor(
    private readonly usersManager: UsersManager,
    private readonly adminUsersManager: AdminUsersManager
  ) {}

  async validateUser(login: string, password: string, ip?: string, scope?: AUTH_SCOPE): Promise<UserModel> {
    // Find user from his login or email
    let user: UserModel = await this.usersManager.findUser(this.dbLogin(login), false)
    if (user) {
      if (user.isGuest) {
        // Allow guests to be authenticated from db and check if the current user is defined as active
        return this.usersManager.logUser(user, password, ip)
      }
      if (!user.isActive) {
        this.logger.error(`${this.validateUser.name} - user *${user.login}* is locked`)
        throw new HttpException('Account locked', HttpStatus.FORBIDDEN)
      }
    }
    // If a user was found, use the stored login. This allows logging in with an email.
    const entry: false | LdapUserEntry = await this.checkAuth(user?.login || login, password)
    if (entry === false) {
      // LDAP auth failed
      if (user) {
        let authSuccess = false
        if (scope) {
          // Try user app password
          authSuccess = await this.usersManager.validateAppPassword(user, password, ip, scope)
        }
        this.usersManager.updateAccesses(user, ip, authSuccess).catch((e: Error) => this.logger.error(`${this.validateUser.name} : ${e}`))
        if (authSuccess) {
          // Logged with app password
          return user
        }
      }
      return null
    } else if (!entry[this.ldapConfig.attributes.login] || !entry[this.ldapConfig.attributes.email]) {
      this.logger.error(`${this.validateUser.name} - required ldap fields are missing : 
      [${this.ldapConfig.attributes.login}, ${this.ldapConfig.attributes.email}] => 
      (${JSON.stringify(entry)})`)
      return null
    }
    const identity = this.createIdentity(entry, password)
    user = await this.updateOrCreateUser(identity, user)
    this.usersManager.updateAccesses(user, ip, true).catch((e: Error) => this.logger.error(`${this.validateUser.name} : ${e}`))
    return user
  }

  private async checkAuth(login: string, password: string): Promise<LdapUserEntry | false> {
    const ldapLogin = this.buildLdapLogin(login)
    // AD: bind directly with the user input (UPN or DOMAIN\user)
    // Generic LDAP: build DN from login attribute + baseDN
    const bindUserDN = this.isAD ? ldapLogin : `${this.ldapConfig.attributes.login}=${ldapLogin},${this.ldapConfig.baseDN}`
    let client: Client
    let error: any
    for (const s of this.ldapConfig.servers) {
      client = new Client({ ...this.clientOptions, url: s })
      try {
        await client.bind(bindUserDN, password)
        return await this.checkAccess(ldapLogin, client)
      } catch (e) {
        if (e.errors?.length) {
          for (const err of e.errors) {
            this.logger.warn(`${this.checkAuth.name} - ${ldapLogin} : ${err}`)
            error = err
          }
        } else {
          error = e
          this.logger.warn(`${this.checkAuth.name} - ${ldapLogin} : ${e}`)
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

  private async checkAccess(login: string, client: Client): Promise<LdapUserEntry | false> {
    const searchFilter = this.buildUserFilter(login, this.ldapConfig.filter)
    try {
      const { searchEntries } = await client.search(this.ldapConfig.baseDN, {
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
      // Create
      const createdUser = await this.adminUsersManager.createUserOrGuest(identity, identity.role)
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

    // Update: check if user information has changed
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
        if (identityHasChanged?.role != null) {
          if (user.role === USER_ROLE.ADMINISTRATOR && !this.ldapConfig.adminGroup) {
            // Prevent removing the admin role when adminGroup was removed or not defined
            delete identityHasChanged.role
          }
        }

        // Update user properties
        await this.adminUsersManager.updateUserOrGuest(user.id, identityHasChanged)

        // Extra stuff
        if (identityHasChanged?.password) {
          delete identityHasChanged.password
        }

        Object.assign(user, identityHasChanged)

        if ('lastName' in identityHasChanged || 'firstName' in identityHasChanged) {
          // Force fullName update in the current user model
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
      if (attr === LDAP_COMMON_ATTR.MEMBER_OF && entry[attr]) {
        entry[attr] = (Array.isArray(entry[attr]) ? entry[attr] : entry[attr] ? [entry[attr]] : [])
          .filter((v: any) => typeof v === 'string')
          .map((v) => v.match(/cn\s*=\s*([^,]+)/i)?.[1]?.trim())
          .filter(Boolean)
        continue
      }
      if (Array.isArray(entry[attr])) {
        // Keep only the first value for all other attributes (e.g., email)
        entry[attr] = entry[attr].length > 0 ? entry[attr][0] : null
      }
    }
    return entry as LdapUserEntry
  }

  private createIdentity(entry: LdapUserEntry, password: string): CreateUserDto {
    const isAdmin =
      typeof this.ldapConfig.adminGroup === 'string' &&
      this.ldapConfig.adminGroup &&
      entry[LDAP_COMMON_ATTR.MEMBER_OF]?.includes(this.ldapConfig.adminGroup)
    return {
      login: this.dbLogin(entry[this.ldapConfig.attributes.login]),
      email: entry[this.ldapConfig.attributes.email] as string,
      password: password,
      role: isAdmin ? USER_ROLE.ADMINISTRATOR : USER_ROLE.USER,
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

  private dbLogin(login: string): string {
    if (login.includes('\\')) {
      return login.split('\\').slice(-1)[0]
    }
    return login
  }

  private buildLdapLogin(login: string): string {
    if (this.ldapConfig.attributes.login === LDAP_LOGIN_ATTR.UPN) {
      if (this.ldapConfig.upnSuffix && !login.includes('@')) {
        return `${login}@${this.ldapConfig.upnSuffix}`
      }
    } else if (this.ldapConfig.attributes.login === LDAP_LOGIN_ATTR.SAM) {
      if (this.ldapConfig.netbiosName && !login.includes('\\')) {
        return `${this.ldapConfig.netbiosName}\\${login}`
      }
    }
    return login
  }

  private buildUserFilter(login: string, extraFilter?: string): string {
    // Build a safe LDAP filter to search for a user.
    // Important: - Values passed to EqualityFilter are auto-escaped by ldapts
    //            - extraFilter is appended as-is (assumed trusted configuration)
    // Output: (&(|(userPrincipalName=john.doe@sync-in.com)(sAMAccountName=john.doe)(cn=john.doe)(uid=john.doe)(mail=john.doe@sync-in.com))(*extraFilter*))

    // Handle the case where the sAMAccountName is provided in domain-qualified format (e.g., SYNC_IN\\user)
    // Note: sAMAccountName is always stored without the domain in Active Directory.
    const dbLogin = this.dbLogin(login)

    const or = new OrFilter({
      filters: this.isAD
        ? [
            new EqualityFilter({ attribute: LDAP_LOGIN_ATTR.SAM, value: dbLogin }),
            new EqualityFilter({ attribute: LDAP_LOGIN_ATTR.UPN, value: dbLogin }),
            new EqualityFilter({ attribute: LDAP_LOGIN_ATTR.MAIL, value: dbLogin })
          ]
        : [
            new EqualityFilter({ attribute: LDAP_LOGIN_ATTR.UID, value: dbLogin }),
            new EqualityFilter({ attribute: LDAP_LOGIN_ATTR.CN, value: dbLogin }),
            new EqualityFilter({ attribute: LDAP_LOGIN_ATTR.MAIL, value: dbLogin })
          ]
    })

    // Convert to LDAP filter string
    let filterString = new AndFilter({ filters: [or] }).toString()

    // Optionally append an extra filter from config (trusted source)
    if (extraFilter && extraFilter.trim()) {
      filterString = `(&${filterString}${extraFilter})`
    }
    return filterString
  }
}
