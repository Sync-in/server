import { z } from 'zod'
import { CLIENT_AUTH_TYPE } from './constants/auth.js'

export const clientAuthTypeParameterSchema = z.enum(CLIENT_AUTH_TYPE)
export const clientIdParameterSchema = z.string()
