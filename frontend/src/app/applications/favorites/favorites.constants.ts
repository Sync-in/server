import { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { faStar } from '@fortawesome/free-solid-svg-icons'

export const FAVORITES_PATH = {
  BASE: 'favorites'
} as const

export const FAVORITES_TITLE = 'Favorites'

export const FAVORITES_ICON: IconDefinition = faStar
