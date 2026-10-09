import { z } from 'zod'

export const appPasswordNameParameterSchema = z.string()
export const avatarLoginParameterSchema = z.string()
export const optionalGroupNameParameterSchema = z.string().optional()
