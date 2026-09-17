import { productName, version } from '../../../package.json'

export const APP_NAME = productName
export const APP_VERSION = version

export const APP_PATH = {
  BASE: '',
  HOME: 'home'
} as const

export const SERVICE_INTERRUPTION_ERROR = 'Service interruption'
export const SERVICE_UNAVAILABLE_ERROR = 'Service unavailable'
