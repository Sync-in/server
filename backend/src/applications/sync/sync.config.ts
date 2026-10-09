import { z } from 'zod'
import { APP_STORE_REPOSITORY } from './constants/store.js'

export const AppStoreConfigSchema = z.looseObject({ repository: z.enum(APP_STORE_REPOSITORY).default(APP_STORE_REPOSITORY.PUBLIC) })
