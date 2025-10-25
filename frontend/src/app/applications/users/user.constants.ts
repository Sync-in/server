/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { faDownload, faLaptop, faUser, faUserGroup, faUsers } from '@fortawesome/free-solid-svg-icons'
import { USER_PERMISSION } from '@sync-in-server/backend/src/applications/users/constants/user'
import { AppMenu } from '../../layout/layout.interfaces'

export const USER_PATH = {
  BASE: 'user',
  ACCOUNT: 'account',
  CLIENTS: 'clients',
  GROUPS: 'groups',
  GUESTS: 'guests',
  APPS: 'apps'
} as const

export const USER_TITLE = {
  ACCOUNT: 'Account',
  CLIENTS: 'Clients',
  GROUPS: 'Groups',
  GUESTS: 'Guests',
  APPS: 'Applications'
} as const

export const USER_NOTIFICATION_TEXT = {
  APPLICATION: 'application',
  APPLICATION_EMAIL: 'application and email'
} as const

// Indexes correspond to status number of `USER_ONLINE_STATUS`
export const USER_ONLINE_STATUS_LIST = ['available', 'busy', 'absent', 'offline']

export const USER_ICON = {
  ACCOUNT: faUser,
  CLIENTS: faLaptop,
  GROUPS: faUsers,
  GUESTS: faUserGroup,
  APPS: faDownload
} as const

export const USER_PASSWORD_CHANGE_TEXT = 'Change me !'

export const USER_LANGUAGE_AUTO = 'auto' as const

export const USER_MENU: AppMenu = {
  title: USER_TITLE.ACCOUNT,
  link: `${USER_PATH.BASE}/${USER_PATH.ACCOUNT}`,
  icon: USER_ICON.ACCOUNT,
  matchLink: new RegExp(`^${USER_PATH.BASE}`),
  level: 11,
  checks: [{ negate: true, prop: 'user', value: 'isLink' }],
  submenus: [
    {
      title: USER_TITLE.ACCOUNT,
      icon: USER_ICON.ACCOUNT,
      link: `${USER_PATH.BASE}/${USER_PATH.ACCOUNT}`,
      matchLink: RegExp(`^${USER_PATH.BASE}/${USER_PATH.ACCOUNT}$`)
    },
    {
      id: USER_PERMISSION.DESKTOP_APP,
      title: USER_TITLE.CLIENTS,
      icon: USER_ICON.CLIENTS,
      link: `${USER_PATH.BASE}/${USER_PATH.CLIENTS}`,
      matchLink: RegExp(`^${USER_PATH.BASE}/${USER_PATH.CLIENTS}$`)
    },
    {
      title: USER_TITLE.GROUPS,
      icon: USER_ICON.GROUPS,
      link: `${USER_PATH.BASE}/${USER_PATH.GROUPS}`,
      matchLink: RegExp(`^${USER_PATH.BASE}/${USER_PATH.GROUPS}`),
      checks: [{ prop: 'user', value: 'isUser' }]
    },
    {
      title: USER_TITLE.GUESTS,
      icon: USER_ICON.GUESTS,
      link: `${USER_PATH.BASE}/${USER_PATH.GUESTS}`,
      matchLink: RegExp(`^${USER_PATH.BASE}/${USER_PATH.GUESTS}$`),
      checks: [{ prop: 'user', value: 'isUser' }]
    },
    {
      id: USER_PERMISSION.DESKTOP_APP,
      title: USER_TITLE.APPS,
      icon: USER_ICON.APPS,
      link: `${USER_PATH.BASE}/${USER_PATH.APPS}`,
      matchLink: RegExp(`^${USER_PATH.BASE}/${USER_PATH.APPS}$`)
    }
  ]
} as const
