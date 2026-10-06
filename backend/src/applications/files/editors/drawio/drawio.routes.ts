import { SPACES_ROUTE } from '../../../spaces/constants/routes.js'

export const DRAWIO_ROUTE = {
  BASE: SPACES_ROUTE.BASE,
  DRAWIO: 'drawio',
  SETTINGS: 'settings'
} as const

export const API_DRAWIO = `${DRAWIO_ROUTE.BASE}/${DRAWIO_ROUTE.DRAWIO}`
export const API_DRAWIO_SETTINGS = `${API_DRAWIO}/${DRAWIO_ROUTE.SETTINGS}`
