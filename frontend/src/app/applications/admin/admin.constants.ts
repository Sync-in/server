import { faGear, faUserGear, faUsersGear } from '@fortawesome/free-solid-svg-icons'
import { AppMenu } from '../../layout/layout.interfaces'

export const ADMIN_PATH = {
  BASE: 'admin',
  USERS: 'users',
  GUESTS: 'guests',
  GROUPS: 'groups',
  PGROUPS: 'personal_groups'
} as const

export const ADMIN_TITLE = {
  ADMIN: 'Administration',
  USERS: 'Users',
  GROUPS: 'Groups',
  GUESTS: 'Guests',
  PGROUPS: 'Personal groups'
} as const

export const ADMIN_ICON = {
  BASE: faGear,
  USERS: faUserGear,
  GROUPS: faUsersGear
} as const

export const ADMIN_MENU: AppMenu = {
  title: ADMIN_TITLE.ADMIN,
  link: `${ADMIN_PATH.BASE}/${ADMIN_PATH.USERS}`,
  icon: ADMIN_ICON.BASE,
  matchLink: new RegExp(`^${ADMIN_PATH.BASE}`),
  level: 12,
  checks: [{ prop: 'user', value: 'isAdmin' }],
  submenus: [
    {
      title: ADMIN_TITLE.USERS,
      icon: ADMIN_ICON.USERS,
      link: `${ADMIN_PATH.BASE}/${ADMIN_PATH.USERS}`,
      matchLink: RegExp(`^${ADMIN_PATH.BASE}/${ADMIN_PATH.USERS}$|^${ADMIN_PATH.BASE}/${ADMIN_PATH.GUESTS}$`)
    },
    {
      title: ADMIN_TITLE.GROUPS,
      icon: ADMIN_ICON.GROUPS,
      link: `${ADMIN_PATH.BASE}/${ADMIN_PATH.GROUPS}`,
      matchLink: RegExp(`^${ADMIN_PATH.BASE}/${ADMIN_PATH.GROUPS}|^${ADMIN_PATH.BASE}/${ADMIN_PATH.PGROUPS}`)
    }
  ]
} as const
