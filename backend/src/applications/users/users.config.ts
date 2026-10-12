import { z } from 'zod'

export const UsersConfigSchema = z.looseObject({ showUngroupedUsers: z.boolean().default(true) })
