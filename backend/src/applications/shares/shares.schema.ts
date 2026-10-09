import { z } from 'zod'
import { LINK_TYPE } from '../links/constants/links.js'

export const linkTypeParameterSchema = z.enum(LINK_TYPE)
