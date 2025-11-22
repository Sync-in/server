/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

export const USER_PASSWORD_MIN_LENGTH = 8
export const USER_MAX_PASSWORD_ATTEMPTS = 10
export const USER_LOGIN_VALIDATION = /^(?! )(?!.* $)[a-zA-Z0-9@\-\\._ ]{2,255}$/

export const USER_PATH = {
  TMP: 'tmp',
  TASKS: 'tasks'
} as const

export enum USER_ROLE {
  ADMINISTRATOR,
  USER,
  GUEST,
  LINK
}

export enum USER_GROUP_ROLE {
  MEMBER,
  MANAGER
}

export const USER_PERMS_SEP = ','

export enum USER_PERMISSION {
  PERSONAL_SPACE = 'personal_space',
  SPACES = 'spaces_access',
  SPACES_ADMIN = 'spaces_admin',
  SHARES = 'shares_access',
  SHARES_ADMIN = 'shares_admin',
  GUESTS_ADMIN = 'guests_admin',
  PERSONAL_GROUPS_ADMIN = 'personal_groups_admin',
  DESKTOP_APP = 'desktop_app_access',
  DESKTOP_APP_SYNC = 'desktop_app_sync',
  WEBDAV = 'webdav_access'
}

export enum GUEST_PERMISSION {
  SPACES = USER_PERMISSION.SPACES,
  SHARES = USER_PERMISSION.SHARES,
  WEBDAV = USER_PERMISSION.WEBDAV
}

export enum USER_ONLINE_STATUS {
  AVAILABLE,
  BUSY,
  ABSENT,
  OFFLINE
}

export enum USER_NOTIFICATION {
  APPLICATION,
  APPLICATION_EMAIL
}

export const USER_SECRET = {
  TWO_FA_SECRET: 'twoFaSecret',
  RECOVERY_CODES: 'recoveryCodes',
  APP_PASSWORDS: 'appPasswords'
} as const
