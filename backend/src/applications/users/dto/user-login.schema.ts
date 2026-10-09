import { z } from 'zod'
import { isValidUserLogin } from '../utils/login.js'

export const userLoginSchema = z.string().refine(isValidUserLogin, { message: 'must be a valid user login' })
