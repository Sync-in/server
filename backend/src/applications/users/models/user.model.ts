import fs from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { AUTH_SESSION } from '../../../authentication/providers/auth-providers.constants.js'
import { popFromObject } from '../../../common/shared.js'
import { configuration } from '../../../configuration/config.environment.js'
import { isPathInside } from '../../files/utils/files.js'
import { SPACE_REPOSITORY } from '../../spaces/constants/spaces.js'
import { GUEST_PERMISSION, USER_PERMISSION, USER_PERMS_SEP, USER_ROLE, USER_TMP_DIRECTORY } from '../constants/user.js'
import type { UserModelProps } from '../interfaces/user-model.interface.js'
import type { Owner } from '../interfaces/owner.interface.js'
import type { UserPreferences } from '../interfaces/user-preferences.interface.js'
import type { UserSecrets } from '../interfaces/user-secrets.interface.js'
import type { User } from '../schemas/user.interface.js'
import { isSafePathSegment, validateUserId } from '../utils/login.js'
import { normalizeUserPreferences } from '../utils/user.js'

// Explicit public representation of a user. Sensitive and backend-only fields
// such as password, secrets, externalId, impersonatedFromId and exp are
// intentionally absent and are therefore stripped by Zod.
const serializedUserSchema = z
  .object({
    id: z.number(),
    login: z.string(),
    email: z.string().nullable(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    role: z.number(),
    language: z.string().nullable(),
    isActive: z.boolean(),
    preferences: z.unknown(),
    notification: z.number(),
    onlineStatus: z.number(),
    permissions: z.string(),
    storageUsage: z.number().nullable(),
    storageQuota: z.number().nullable(),
    storageIndexing: z.boolean(),
    passwordAttempts: z.number(),
    currentIp: z.string().nullable(),
    lastIp: z.string().nullable(),
    currentAccess: z.union([z.date(), z.string()]).nullable(),
    lastAccess: z.union([z.date(), z.string()]).nullable(),
    createdAt: z.union([z.date(), z.string()]),
    impersonatedClientId: z.string(),
    clientId: z.string(),
    fullName: z.string(),
    impersonated: z.boolean(),
    authSession: z.unknown(),
    avatarBase64: z.string()
  })
  .partial()
  .extend({
    applications: z.array(z.string()),
    // Computed getters are not enumerable class properties, so they must be
    // explicitly included in the serialized representation.
    isAdmin: z.boolean(),
    isUser: z.boolean(),
    isGuest: z.boolean(),
    isLink: z.boolean(),
    quotaIsExceeded: z.boolean(),
    twoFaEnabled: z.boolean(),
    appPasswords: z.number()
  })

// Derived getters are recomputed when the cached data creates a new UserModel.
// twoFaEnabled is retained because it is needed to restore the corresponding
// public authentication state without caching the underlying secret.
const cachedUserSchema = serializedUserSchema.omit({
  isAdmin: true,
  isUser: true,
  isGuest: true,
  isLink: true,
  quotaIsExceeded: true,
  appPasswords: true
})

export class UserModel implements Omit<User, 'password' | 'permissions'> {
  id!: number
  login!: string
  email!: string
  firstName!: string | null
  lastName!: string | null
  role!: number
  language!: string | null
  isActive!: boolean
  preferences!: UserPreferences
  notification!: number
  onlineStatus!: number
  permissions?: string
  storageUsage!: number | null
  storageQuota!: number | null
  storageIndexing!: boolean
  passwordAttempts!: number
  currentIp!: string | null
  lastIp!: string | null
  currentAccess!: Date | null
  lastAccess!: Date | null
  createdAt!: Date
  // Sensitive/internal values intentionally excluded from serializedUserSchema.
  externalId!: string | null
  password?: string
  secrets!: UserSecrets | null
  // Backend-only impersonation source; never exposed in the public representation.
  impersonatedFromId?: number
  impersonatedClientId?: string
  // used for desktop|cmd app
  clientId?: string
  // outside db schema
  fullName!: string
  impersonated?: boolean
  authSession?: AUTH_SESSION
  avatarBase64?: string
  // permissions as a list
  applications: string[] = []
  // Token-only refresh expiration; never exposed in the public representation.
  exp?: number

  constructor(props: UserModelProps, removePassword = true) {
    // User model can be instantiated with data from the database or from a token payload
    this.initSecrets(props)
    Object.assign(this, props)
    this.preferences = normalizeUserPreferences(this.isLink ? null : this.preferences)
    if (removePassword) {
      // always remove the password field from model for obvious security reasons
      // do not remove it from `props` to not mutate the object
      this.removePassword()
    }
    this.setFullName()
    this.setApplications()
    this.setProfile()
  }

  static fromSerialized(value: unknown): UserModel {
    return new UserModel(cachedUserSchema.parse(value) as ConstructorParameters<typeof UserModel>[0])
  }

  #homePath!: string

  get homePath(): string {
    return (this.#homePath ||= this.isLink ? UserModel.getLinkHomePath(this.id) : UserModel.getHomePath(this.login))
  }

  #filesPath!: string

  get filesPath(): string {
    return (this.#filesPath ||= path.join(this.homePath, SPACE_REPOSITORY.FILES))
  }

  #trashPath!: string

  get trashPath(): string {
    return (this.#trashPath ||= path.join(this.homePath, SPACE_REPOSITORY.TRASH))
  }

  #tmpPath!: string

  get tmpPath(): string {
    return (this.#tmpPath ||= path.join(this.homePath, USER_TMP_DIRECTORY))
  }

  // Public computed values explicitly included in serializedUserSchema.
  get isAdmin(): boolean {
    return this.role === USER_ROLE.ADMINISTRATOR
  }

  get isUser(): boolean {
    return this.role === USER_ROLE.USER || this.role === USER_ROLE.ADMINISTRATOR
  }

  get isGuest(): boolean {
    return this.role === USER_ROLE.GUEST
  }

  get isLink(): boolean {
    return this.role === USER_ROLE.LINK
  }

  get quotaIsExceeded(): boolean {
    return this.storageQuota !== null && this.storageUsage! >= this.storageQuota
  }

  get twoFaEnabled(): boolean {
    return !!this.secrets?.twoFaSecret
  }

  get appPasswords(): number {
    return this.secrets?.appPasswords?.length || 0
  }

  static getHomePath(userLogin: string): string {
    if (!isSafePathSegment(userLogin)) {
      throw new Error('User login must be a single path segment')
    }
    const basePath = configuration.applications.files.usersPath
    const homePath = path.resolve(basePath, userLogin)
    if (!isPathInside(basePath, homePath)) {
      throw new Error('User login resolves outside user data directory')
    }
    return homePath
  }

  static getFilesPath(userLogin: string): string {
    return path.join(UserModel.getHomePath(userLogin), SPACE_REPOSITORY.FILES)
  }

  static getTrashPath(userLogin: string): string {
    return path.join(UserModel.getHomePath(userLogin), SPACE_REPOSITORY.TRASH)
  }

  static getTmpPath(userLogin: string): string {
    return path.join(UserModel.getHomePath(userLogin), USER_TMP_DIRECTORY)
  }

  static getLinkHomePath(userId: number): string {
    validateUserId(userId)
    const basePath = configuration.applications.files.linksPath
    const homePath = path.resolve(basePath, String(userId))
    if (!isPathInside(basePath, homePath)) {
      throw new Error('Link user id resolves outside link data directory')
    }
    return homePath
  }

  static getLinkTmpPath(userId: number): string {
    return path.join(UserModel.getLinkHomePath(userId), USER_TMP_DIRECTORY)
  }

  static getRepositoryPath(userLogin: string, inTrash = false): string {
    if (inTrash) return UserModel.getTrashPath(userLogin)
    return UserModel.getFilesPath(userLogin)
  }

  toString(): string {
    return `*User <${this.login}> (${this.id})*`
  }

  serialize() {
    return serializedUserSchema.parse(this)
  }

  // noinspection JSUnusedGlobalSymbols
  toJSON() {
    /*
     * This hook is called implicitly by JSON.stringify(), including when Fastify
     * serializes an HTTP response containing a UserModel instance. It delegates to
     * the Zod-backed serializer to expose computed public properties while omitting
     * sensitive and backend-only properties. Use serialize() directly when an
     * explicit plain-object representation is needed.
     */
    return this.serialize()
  }

  removePassword() {
    delete this.password
  }

  setFullName(force = false) {
    if (!this.fullName || force) {
      this.fullName = `${this.firstName || ''} ${this.lastName || ''}`.trim()
    }
  }

  async makePaths(): Promise<void> {
    if (this.isLink) return
    const paths = this.isGuest ? [this.tmpPath] : [this.filesPath, this.trashPath, this.tmpPath]
    for (const p of paths) {
      await fs.mkdir(p, { recursive: true })
    }
  }

  asOwner(): Owner {
    return { id: this.id, login: this.login, email: this.email, fullName: this.fullName }
  }

  getInitials(): string {
    let initials: { f: string; l: string }
    if (this.firstName) {
      if (this.lastName) {
        initials = { f: this.firstName.charAt(0), l: this.lastName.charAt(0) }
      }
      initials = { f: this.firstName.charAt(0), l: this.firstName.charAt(1) }
    } else {
      initials = { f: this.login.charAt(0), l: this.login.charAt(1) }
    }
    return `${initials.f.toUpperCase()}${initials.l.toLowerCase()}`
  }

  havePermission(permission: string): boolean {
    if (this.isAdmin) {
      return true
    }
    if (permission === USER_PERMISSION.PERSONAL_SPACE && this.isGuest) {
      return false
    }
    return this.applications.indexOf(permission) !== -1
  }

  haveRole(role: number): boolean {
    return this.role <= role
  }

  private initSecrets(props: UserModelProps) {
    // Remove the serialized `twoFaEnabled` property before assigning values to the model,
    // because the public value is exposed through a getter.
    if (props && 'twoFaEnabled' in props) {
      // Only used when the User model is instantiated from a token payload
      // Set a `twoFaSecret` property (boolean) on the `secrets` property so that the `twoFaEnabled` getter returns `true`
      this.secrets = { twoFaSecret: popFromObject('twoFaEnabled', props) }
    }
  }

  private setProfile() {
    if (this.isLink) {
      this.login = `Link (${this.id})`
      this.email = 'guest-link@sync-in'
    }
  }

  private setApplications() {
    if (this.isGuest) {
      // dynamically set the permissions
      this.applications = Object.values(GUEST_PERMISSION)
    } else if (this.permissions) {
      this.applications = this.permissions.split(USER_PERMS_SEP)
    }
    delete this.permissions
  }
}
