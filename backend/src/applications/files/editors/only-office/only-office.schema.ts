import { z } from 'zod'
import { USER_THEME } from '../../../users/constants/user-preferences.js'

export const themeQueryParameterSchema = z.enum([USER_THEME.DARK, USER_THEME.LIGHT]).optional()
