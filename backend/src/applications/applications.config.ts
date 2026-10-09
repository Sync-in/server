import { z } from 'zod'
import { FilesConfigSchema } from './files/files.config.js'
import { AppStoreConfigSchema } from './sync/sync.config.js'
import { UsersConfigSchema } from './users/users.config.js'

export const ApplicationsConfigSchema = z.looseObject({
  files: FilesConfigSchema,
  users: UsersConfigSchema.prefault({}),
  appStore: AppStoreConfigSchema.prefault({})
})
