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
import type { AuthProviderLDAPConfig } from './auth-ldap.config'
import { ALL_LDAP_ATTRIBUTES, LDAP_COMMON_ATTR, LDAP_LOGIN_ATTR, LDAP_SEARCH_ATTR } from './auth-ldap.constants'

type LdapUserEntry = Entry &
  Record<LDAP_LOGIN_ATTR | Exclude<(typeof LDAP_COMMON_ATTR)[keyof typeof LDAP_COMMON_ATTR], typeof LDAP_COMMON_ATTR.MEMBER_OF>, string> & {
    [LDAP_COMMON_ATTR.MEMBER_OF]?: string[]
  }

@Injectable()
export class AuthProviderLDAP implements AuthProvider {
  private readonly logger = new Logger(AuthProviderLDAP.name)
  private readonly ldapConfig: AuthProviderLDAPConfig = configuration.auth.ldap
  private readonly hasServiceBind = Boolean(this.ldapConfig.serviceBindDN && this.ldapConfig.serviceBindPassword)
  private readonly isAD = this.ldapConfig.attributes.login === LDAP_LOGIN_ATTR.SAM || this.ldapConfig.attributes.login === LDAP_LOGIN_ATTR.UPN
  private clientOptions: ClientOptions = { timeout: 6000, connectTimeout: 6000, url: '' }

  constructor(
    private readonly usersManager: UsersManager,
    private readonly adminUsersManager: AdminUsersManager
  ) {}

  async validateUser(loginOrEmail: string, password: string, ip?: string, scope?: AUTH_SCOPE): Promise<UserModel> {
    // Authenticate user via LDAP and sync local user state.
    // Find user from his login or email
    let user: UserModel = await this.usersManager.findUser(this.dbLogin(loginOrEmail), false)
    if (user) {
      if (user.isGuest || scope) {
        // Allow local password authentication for guest users and application scopes (app passwords)
        return this.usersManager.logUser(user, password, ip, scope)
      }
      if (!user.isActive) {
        this.logger.error({ tag: this.validateUser.name, msg: `user *${user.login}* is locked` })
        throw new HttpException('Account locked', HttpStatus.FORBIDDEN)
      }
    }
    let ldapErrorMessage: string
    let entry: false | LdapUserEntry = false
    try {
      // If a user was found, use the stored login. This allows logging in with an email.
      entry = await this.checkAuth(user?.login || loginOrEmail, password)
    } catch (e) {
      ldapErrorMessage = e.message
    }

    // LDAP auth failed or exception raised
    if (entry === false) {
      // If LDAP is unavailable (connectivity/service error), allow local password fallback.
      // Allow local password authentication for:
      // - admin users (break-glass access)
      // - regular users when password authentication fallback is enabled
      if (user && (user.isAdmin || (Boolean(ldapErrorMessage) && this.ldapConfig.options.enablePasswordAuthFallback))) {
        const localUser = await this.usersManager.logUser(user, password, ip)
        if (localUser) return localUser
      }

      if (ldapErrorMessage) {
        throw new HttpException(ldapErrorMessage, HttpStatus.SERVICE_UNAVAILABLE)
      }

      return null
    }

    if (!entry[this.ldapConfig.attributes.login] || !entry[this.ldapConfig.attributes.email]) {
      this.logger.error({
        tag: this.validateUser.name,
        msg: `required ldap fields are missing : 
      [${this.ldapConfig.attributes.login}, ${this.ldapConfig.attributes.email}] => 
      (${JSON.stringify(entry)})`
      })
      return null
    }

    if (!user && !this.ldapConfig.options.autoCreateUser) {
      this.logger.warn({ tag: this.validateUser.name, msg: `User not found and autoCreateUser is disabled` })
      throw new HttpException('User not found', HttpStatus.UNAUTHORIZED)
    }

    const identity = this.createIdentity(entry, password)
    user = await this.updateOrCreateUser(identity, user)
    this.usersManager.updateAccesses(user, ip, true).catch((e: Error) => this.logger.error({ tag: this.validateUser.name, msg: `${e}` }))
    return user
  }

  private async checkAuth(login: string, password: string): Promise<LdapUserEntry | false> {
    // Bind and fetch LDAP entry, optionally via service account.
    const ldapLogin = this.buildLdapLogin(login)
    // AD: bind directly with the user input (UPN or DOMAIN\user)
    // Generic LDAP: build DN from login attribute + baseDN
    const bindUserDN = this.buildBindUserDN(ldapLogin)
    let error: InvalidCredentialsError | any
    for (const s of this.ldapConfig.servers) {
      const client = new Client({ ...this.clientOptions, url: s })
      let attemptedBindDN = bindUserDN
      try {
        if (this.hasServiceBind) {
          attemptedBindDN = this.ldapConfig.serviceBindDN
          await client.bind(this.ldapConfig.serviceBindDN, this.ldapConfig.serviceBindPassword)
          const result = await this.findUserEntry(ldapLogin, client)
          if (!result || !result.userDn) {
            this.logger.warn({ tag: this.checkAuth.name, msg: `no LDAP entry found for : ${login}` })
            return false
          }
          const { entry, userDn } = result
          attemptedBindDN = userDn
          await client.bind(userDn, password)
          return entry
        }
        attemptedBindDN = bindUserDN
        await client.bind(bindUserDN, password)
        return await this.checkAccess(ldapLogin, client, bindUserDN)
      } catch (e) {
        error = this.handleBindError(e, attemptedBindDN)
        if (error instanceof InvalidCredentialsError) {
          return false
        }
      } finally {
        await client.unbind()
      }
    }
    if (error) {
      this.logger.error({ tag: this.checkAuth.name, msg: `${error}` })
      if (CONNECT_ERROR_CODE.has(error.code)) {
        throw new Error('Authentication service error')
      }
    }
    return false
  }

  private async checkAccess(login: string, client: Client, bindUserDN?: string): Promise<LdapUserEntry | false> {
    // Search for the LDAP entry and normalize attributes.
    const result = await this.findUserEntry(login, client, bindUserDN)
    return result ? result.entry : false
  }

  private async findUserEntry(login: string, client: Client, bindUserDN?: string): Promise<{ entry: LdapUserEntry; userDn?: string } | false> {
    const searchFilter = this.buildUserFilter(login, this.ldapConfig.filter)
    try {
      const { searchEntries } = await client.search(this.ldapConfig.baseDN, {
        scope: LDAP_SEARCH_ATTR.SUB,
        filter: searchFilter,
        attributes: ALL_LDAP_ATTRIBUTES
      })

      if (searchEntries.length === 0) {
        this.logger.debug({ tag: this.findUserEntry.name, msg: `search filter : ${searchFilter}` })
        this.logger.warn({ tag: this.findUserEntry.name, msg: `no LDAP entry found for : ${login}` })
        return false
      }

      if (searchEntries.length > 1) {
        this.logger.warn({ tag: this.findUserEntry.name, msg: `multiple LDAP entries found for : ${login}, using first one` })
      }

      const rawEntry = searchEntries[0]
      const entry: LdapUserEntry = this.convertToLdapUserEntry(rawEntry)
      const userDn = (rawEntry as { dn?: string }).dn || bindUserDN

      if (this.ldapConfig.options.adminGroup && !this.hasAdminGroup(entry, this.ldapConfig.options.adminGroup)) {
        if (userDn && (await this.isMemberOfGroupOfNames(this.ldapConfig.options.adminGroup, userDn, client))) {
          const existing = Array.isArray(entry[LDAP_COMMON_ATTR.MEMBER_OF]) ? entry[LDAP_COMMON_ATTR.MEMBER_OF] : []
          entry[LDAP_COMMON_ATTR.MEMBER_OF] = [...new Set([...existing, this.ldapConfig.options.adminGroup])]
        }
      }

      // Return the first matching entry.
      return { entry, userDn }
    } catch (e) {
      this.logger.debug({ tag: this.findUserEntry.name, msg: `search filter : ${searchFilter}` })
      this.logger.error({ tag: this.findUserEntry.name, msg: `${login} : ${e}` })
      return false
    }
  }

  private async updateOrCreateUser(identity: CreateUserDto, user: UserModel): Promise<UserModel> {
    // Create or update the local user record from LDAP identity.
    if (user === null) {
      // Create
      identity.permissions = this.ldapConfig.options.autoCreatePermissions.join(',')
      const createdUser = await this.adminUsersManager.createUserOrGuest(identity, identity.role)
      const freshUser = await this.usersManager.fromUserId(createdUser.id)
      if (!freshUser) {
        this.logger.error({ tag: this.updateOrCreateUser.name, msg: `user was not found : ${createdUser.login} (${createdUser.id})` })
        throw new HttpException('User not found', HttpStatus.NOT_FOUND)
      }
      return freshUser
    }

    if (identity.login !== user.login) {
      this.logger.error({ tag: this.updateOrCreateUser.name, msg: `user login mismatch : ${identity.login} !== ${user.login}` })
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
          if (user.role === USER_ROLE.ADMINISTRATOR && !this.ldapConfig.options.adminGroup) {
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
        this.logger.warn({ tag: this.updateOrCreateUser.name, msg: `unable to update user *${user.login}* : ${e}` })
      }
    }
    return user
  }

  private convertToLdapUserEntry(entry: Entry): LdapUserEntry {
    // Normalize memberOf and other LDAP attributes for downstream usage.
    for (const attr of ALL_LDAP_ATTRIBUTES) {
      if (attr === LDAP_COMMON_ATTR.MEMBER_OF && entry[attr]) {
        const values = (Array.isArray(entry[attr]) ? entry[attr] : entry[attr] ? [entry[attr]] : []).filter(
          (v: any) => typeof v === 'string'
        ) as string[]
        const normalized = new Set<string>()
        for (const value of values) {
          normalized.add(value)
          const cn = value.match(/cn\s*=\s*([^,]+)/i)?.[1]?.trim()
          if (cn) {
            normalized.add(cn)
          }
        }
        entry[attr] = Array.from(normalized)
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
    // Build the local identity payload from LDAP entry.
    const isAdmin =
      typeof this.ldapConfig.options.adminGroup === 'string' &&
      this.ldapConfig.options.adminGroup &&
      entry[LDAP_COMMON_ATTR.MEMBER_OF]?.includes(this.ldapConfig.options.adminGroup)
    return {
      login: this.dbLogin(entry[this.ldapConfig.attributes.login]),
      email: entry[this.ldapConfig.attributes.email] as string,
      password: password,
      role: isAdmin ? USER_ROLE.ADMINISTRATOR : USER_ROLE.USER,
      ...this.getFirstNameAndLastName(entry)
    } satisfies CreateUserDto
  }

  private getFirstNameAndLastName(entry: LdapUserEntry): { firstName: string; lastName: string } {
    // Resolve name fields with structured and fallback attributes.
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
    // Normalize domain-qualified logins to the user part.
    if (login.includes('\\')) {
      return login.split('\\').slice(-1)[0]
    }
    return login
  }

  private buildLdapLogin(login: string): string {
    // Build the bind login string based on LDAP config.
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

  private buildBindUserDN(ldapLogin: string): string {
    return this.isAD ? ldapLogin : `${this.ldapConfig.attributes.login}=${ldapLogin},${this.ldapConfig.baseDN}`
  }

  private buildUserFilter(login: string, extraFilter?: string): string {
    // Build a safe LDAP filter to search for the user entry.
    // Important: - Values passed to EqualityFilter are auto-escaped by ldapts
    //            - extraFilter is appended as-is (assumed trusted configuration)
    // Note: The OR clause differs between AD and generic LDAP.

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

  private hasAdminGroup(entry: LdapUserEntry, adminGroup: string): boolean {
    // Check for the admin group in the normalized `memberOf` list.
    return Array.isArray(entry[LDAP_COMMON_ATTR.MEMBER_OF]) && entry[LDAP_COMMON_ATTR.MEMBER_OF].includes(adminGroup)
  }

  private async isMemberOfGroupOfNames(adminGroup: string, userDn: string, client: Client): Promise<boolean> {
    // Check groupOfNames membership by querying group entries.
    // When adminGroup is a DN, search at the group DN; otherwise search under baseDN.
    const { dn, cn } = this.parseAdminGroup(adminGroup)
    // Build a filter that matches groupOfNames entries containing the user's DN as a member.
    const filters = [
      new EqualityFilter({ attribute: LDAP_SEARCH_ATTR.OBJECT_CLASS, value: LDAP_SEARCH_ATTR.GROUP_OF_NAMES }),
      new EqualityFilter({ attribute: LDAP_SEARCH_ATTR.MEMBER, value: userDn })
    ]
    // If a CN is available, narrow the query to that specific group name.
    if (cn) {
      filters.splice(1, 0, new EqualityFilter({ attribute: LDAP_COMMON_ATTR.CN, value: cn }))
    }
    const filter = new AndFilter({ filters }).toString()

    try {
      // Use BASE scope for an exact DN lookup, otherwise SUB to scan within baseDN.
      const { searchEntries } = await client.search(dn || this.ldapConfig.baseDN, {
        scope: dn ? LDAP_SEARCH_ATTR.BASE : LDAP_SEARCH_ATTR.SUB,
        filter,
        attributes: [LDAP_COMMON_ATTR.CN]
      })
      // Any matching entry implies membership.
      return searchEntries.length > 0
    } catch (e) {
      this.logger.warn({ tag: this.isMemberOfGroupOfNames.name, msg: `${e}` })
      return false
    }
  }

  private parseAdminGroup(adminGroup: string): { dn?: string; cn?: string } {
    // Accept either full DN or simple CN and extract what we can for lookups.
    const looksLikeDn = adminGroup.includes('=') && adminGroup.includes(',')
    if (!looksLikeDn) {
      return { cn: adminGroup }
    }
    const cn = adminGroup.match(/cn\s*=\s*([^,]+)/i)?.[1]?.trim()
    return { dn: adminGroup, cn }
  }

  private handleBindError(error: any, attemptedBindDN: string): InvalidCredentialsError | any {
    // Prefer the most specific LDAP error when multiple errors are returned.
    if (error?.errors?.length) {
      for (const err of error.errors) {
        this.logger.warn({ tag: this.handleBindError.name, msg: `${attemptedBindDN} : ${err}` })
      }
      return error.errors[error.errors.length - 1]
    }
    this.logger.warn({ tag: this.handleBindError.name, msg: `${attemptedBindDN} : ${error}` })
    return error
  }
}
