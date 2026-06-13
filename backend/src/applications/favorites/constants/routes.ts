import { APP_BASE_ROUTE } from '../../applications.constants'

export const FAVORITES_ROUTE = {
  BASE: `${APP_BASE_ROUTE}/favorites`,
  SPACES: 'spaces'
}

export const API_FAVORITES = FAVORITES_ROUTE.BASE
export const API_FAVORITES_FROM_SPACE = `${FAVORITES_ROUTE.BASE}/${FAVORITES_ROUTE.SPACES}`
