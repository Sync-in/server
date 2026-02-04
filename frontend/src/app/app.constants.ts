import { faCircleHalfStroke } from '@fortawesome/free-solid-svg-icons'
import { productName, version } from '../../../package.json'
import { AppMenu } from './layout/layout.interfaces'

export const APP_NAME = productName
export const APP_VERSION = version

export const APP_PATH = {
  BASE: ''
} as const

export const APP_MENU: AppMenu = {
  title: 'NAVIGATION',
  icon: faCircleHalfStroke,
  link: '',
  level: 0,
  submenus: []
} as const

export const SERVER_CONNECTION_ERROR = 'Server connection error'
