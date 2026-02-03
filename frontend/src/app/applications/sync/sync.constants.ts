import { faDesktop, faRightLeft, faRotate, faServer, faWandMagicSparkles } from '@fortawesome/free-solid-svg-icons'
import { SYNC_BASE_ROUTE, SYNC_ROUTE } from '@sync-in-server/backend/src/applications/sync/constants/routes'
import { USER_PERMISSION } from '@sync-in-server/backend/src/applications/users/constants/user'
import { BehaviorSubject } from 'rxjs'
import { AppMenu } from '../../layout/layout.interfaces'

export const SYNC_TITLE = {
  SYNC: 'Sync',
  SYNCS: 'Synchronizations',
  TRANSFERS: 'Transfers',
  WIZARD: 'Wizard',
  WIZARD_CLIENT: 'Client',
  WIZARD_SERVER: 'Server',
  WIZARD_SETTINGS: 'Settings'
} as const

export const SYNC_ICON = {
  SYNC: faRotate,
  TRANSFERS: faRightLeft,
  WIZARD: faWandMagicSparkles,
  SERVER: faServer,
  CLIENT: faDesktop
} as const

export const SYNC_PATH = {
  BASE: SYNC_BASE_ROUTE,
  PATHS: SYNC_ROUTE.PATHS,
  TRANSFERS: 'transfers',
  WIZARD: 'wizard',
  WIZARD_CLIENT: 'client',
  WIZARD_SERVER: 'server',
  WIZARD_SETTINGS: 'settings'
}

export const SYNC_MENU: AppMenu = {
  id: USER_PERMISSION.DESKTOP_APP_SYNC,
  title: SYNC_TITLE.SYNC,
  link: SYNC_PATH.BASE,
  icon: SYNC_ICON.SYNC,
  iconAnimated: false,
  checks: [{ prop: 'user', value: 'clientId' }],
  count: { value: new BehaviorSubject<number>(0), level: 'warning' },
  matchLink: new RegExp(`^${SYNC_PATH.BASE}`),
  level: 3,
  submenus: [
    {
      title: SYNC_TITLE.SYNCS,
      icon: SYNC_ICON.SYNC,
      link: `${SYNC_PATH.BASE}/${SYNC_PATH.PATHS}`,
      matchLink: new RegExp(`^${SYNC_PATH.BASE}/${SYNC_PATH.PATHS}`)
    },
    {
      title: SYNC_TITLE.TRANSFERS,
      icon: SYNC_ICON.TRANSFERS,
      link: `${SYNC_PATH.BASE}/${SYNC_PATH.TRANSFERS}`,
      matchLink: new RegExp(`^${SYNC_PATH.BASE}/${SYNC_PATH.TRANSFERS}`)
    },
    {
      title: SYNC_TITLE.WIZARD,
      icon: SYNC_ICON.WIZARD,
      link: `${SYNC_PATH.BASE}/${SYNC_PATH.WIZARD}`,
      matchLink: new RegExp(`^${SYNC_PATH.BASE}/${SYNC_PATH.WIZARD}`)
    }
  ]
}
