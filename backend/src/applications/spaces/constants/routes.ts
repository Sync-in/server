import { APP_BASE_ROUTE } from '../../applications.constants'
import { SPACE_REPOSITORY } from './spaces'

export const SPACES_BASE_ROUTE = 'spaces'
export const SPACES_ROUTE = {
  BASE: `${APP_BASE_ROUTE}/${SPACES_BASE_ROUTE}`,
  BROWSE: 'browse',
  TREE: 'tree',
  LIST: 'list',
  ROOTS: 'roots',
  ROOT_CHECK: 'root/check',
  LINKS: 'links',
  TRASH: SPACE_REPOSITORY.TRASH,
  SHARES: SPACE_REPOSITORY.SHARES
} as const

export const API_SPACES_BROWSE = `${SPACES_ROUTE.BASE}/${SPACES_ROUTE.BROWSE}`
export const API_SPACES_TREE = `${SPACES_ROUTE.BASE}/${SPACES_ROUTE.TREE}`
export const API_SPACES_LIST = `${SPACES_ROUTE.BASE}/${SPACES_ROUTE.LIST}`
export const API_SPACES_TRASH_BINS_LIST = `${SPACES_ROUTE.BASE}/${SPACES_ROUTE.TRASH}/${SPACES_ROUTE.LIST}`
export const API_SPACES_ROOT_CHECK = `${SPACES_ROUTE.BASE}/${SPACES_ROUTE.ROOT_CHECK}`
