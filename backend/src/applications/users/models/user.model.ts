/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Exclude, Expose } from 'class-transformer'
import fs from 'node:fs/promises'
import path from 'node:path'
import { popFromObject } from '../../../common/shared'
import { configuration } from '../../../configuration/config.environment'
import { SPACE_REPOSITORY } from '../../spaces/constants/spaces'
import { GUEST_PERMISSION, USER_PATH, USER_PERMISSION, USER_PERMS_SEP, USER_ROLE } from '../constants/user'
import type { Owner } from '../interfaces/owner.interface'
import type { UserSecrets } from '../interfaces/user-secrets.interface'
import type { User } from '../schemas/user.interface'

export class UserModel implements User {
  id: number
  login: string
  email: string
  firstName: string
  lastName: string
  role: number
  language: string
  isActive: boolean
  notification: number
  onlineStatus: number
  permissions: string
  storageUsage: number
  storageQuota: number
  passwordAttempts: number
  currentIp: string
  lastIp: string
  currentAccess: Date
  lastAccess: Date
  createdAt: Date
  // exclusions
  @Exclude()
  password: string
  @Exclude()
  secrets: UserSecrets
  @Exclude()
  // only used on backend
  impersonatedFromId?: number
  impersonatedClientId?: string
  // used for desktop|cmd app
  clientId?: string

  // outside db schema
  fullName: string
  impersonated?: boolean
  avatarBase64?: string
  // permissions as a list
  applications: string[] = []
  @Exclude({ toPlainOnly: true })
  exp?: number // refresh token expiration needed to refresh

  constructor(props: Partial<User> & { exp?: number; twoFaEnabled?: boolean }, removePassword = true) {
    // User model can be instantiated with data from the database or from a token payload
    this.initSecrets(props)
    Object.assign(this, props)
    if (removePassword) {
      // always remove the password field from model for obvious security reasons
      // do not remove it from `props` to not mutate the object
      this.removePassword()
    }
    this.setFullName()
    this.setApplications()
    this.setProfile()
  }

  private _homePath: string

  get homePath(): string {
    if (this.isLink || this.isGuest) {
      return (this._homePath ||= path.join(configuration.applications.files.tmpPath, this.isGuest ? 'guests' : 'links', this.login))
    }
    return (this._homePath ||= path.join(configuration.applications.files.usersPath, this.login))
  }

  private _filesPath: string

  get filesPath(): string {
    return (this._filesPath ||= path.join(this.homePath, SPACE_REPOSITORY.FILES))
  }

  private _trashPath: string

  get trashPath(): string {
    return (this._trashPath ||= path.join(this.homePath, SPACE_REPOSITORY.TRASH))
  }

  private _tmpPath: string

  get tmpPath(): string {
    return (this._tmpPath ||= path.join(this.homePath, USER_PATH.TMP))
  }

  private _tasksPath: string

  get tasksPath(): string {
    return (this._tasksPath ||= path.join(this.tmpPath, USER_PATH.TASKS))
  }

  @Expose()
  get isAdmin(): boolean {
    return this.role === USER_ROLE.ADMINISTRATOR
  }

  @Expose()
  get isUser(): boolean {
    return this.role === USER_ROLE.USER || this.role === USER_ROLE.ADMINISTRATOR
  }

  @Expose()
  get isGuest(): boolean {
    return this.role === USER_ROLE.GUEST
  }

  @Expose()
  get isLink(): boolean {
    return this.role === USER_ROLE.LINK
  }

  @Expose()
  get quotaIsExceeded(): boolean {
    return this.storageQuota !== null && this.storageUsage >= this.storageQuota
  }

  @Expose()
  get twoFaEnabled(): boolean {
    return !!this.secrets?.twoFaSecret
  }

  @Expose()
  get appPasswords(): number {
    return this.secrets?.appPasswords?.length || 0
  }

  static getHomePath(userLogin: string, isGuest = false, isLink = false): string {
    if (isGuest || isLink) {
      return path.join(configuration.applications.files.tmpPath, isGuest ? 'guests' : 'links', userLogin)
    }
    return path.join(configuration.applications.files.usersPath, userLogin)
  }

  static getFilesPath(userLogin: string): string {
    return path.join(UserModel.getHomePath(userLogin), SPACE_REPOSITORY.FILES)
  }

  static getTrashPath(userLogin: string): string {
    return path.join(UserModel.getHomePath(userLogin), SPACE_REPOSITORY.TRASH)
  }

  static getTasksPath(userLogin: string, isGuest = false, isLink = false): string {
    return path.join(UserModel.getHomePath(userLogin, isGuest, isLink), USER_PATH.TMP, USER_PATH.TASKS)
  }

  static getRepositoryPath(userLogin: string, inTrash = false): string {
    if (inTrash) return UserModel.getTrashPath(userLogin)
    return UserModel.getFilesPath(userLogin)
  }

  toString(): string {
    return `*User <${this.login}> (${this.id})*`
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
    if (this.isGuest || this.isLink) {
      await fs.mkdir(this.tasksPath, { recursive: true })
    } else {
      for (const p of [this.filesPath, this.trashPath, this.tasksPath]) {
        await fs.mkdir(p, { recursive: true })
      }
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

  private initSecrets(props: Partial<UserModel>) {
    // Remove the `twoFaEnabled` property to avoid conflicts with the current getter when using `plainToClass` with `class-validator`
    // The `props` variable may be empty when the class is instantiated using `plainToClass`
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
