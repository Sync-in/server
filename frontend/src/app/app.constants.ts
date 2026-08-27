import { LucideContrast } from '@lucide/angular'
import { productName, version } from '../../../package.json'
import { AppMenu } from './layout/layout.interfaces'

export const APP_NAME = productName
export const APP_VERSION = version

export const APP_PATH = {
  BASE: '',
  HOME: 'home'
} as const

export const APP_MENU: AppMenu = {
  title: 'NAVIGATION',
  icon: LucideContrast,
  link: '',
  submenus: []
} as const

export const SERVER_CONNECTION_ERROR = 'Server connection error'
