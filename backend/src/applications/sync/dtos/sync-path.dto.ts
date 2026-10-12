import { z } from 'zod'
import { integerNumberSchema } from '../../../configuration/config.schema.js'
import {
  SYNC_MAX_PATH_FILTER_LENGTH,
  SYNC_MAX_PATH_FILTERS,
  SYNC_PATH_CONFLICT_MODE,
  SYNC_PATH_DIFF_MODE,
  SYNC_PATH_MODE,
  SYNC_PATH_SCHEDULER_UNIT
} from '../constants/sync.js'

const syncPathSchedulerSchema = z.object({
  value: z.number().int(),
  unit: z.enum(SYNC_PATH_SCHEDULER_UNIT)
})

const syncPathLastSyncSchema = z.union([z.string(), z.number(), z.date()])

const lowerCaseEnum = <T extends Record<string, string>>(values: T) => z.string().toLowerCase().pipe(z.enum(values))

export const syncPathSchema = z.object({
  id: integerNumberSchema.nullish(),
  name: z.string().min(1),
  localPath: z.string().min(1),
  remotePath: z.string().min(1),
  permissions: z.string().nullish(),
  mode: lowerCaseEnum(SYNC_PATH_MODE),
  ignoreDelete: z.boolean().nullish(),
  diffMode: lowerCaseEnum(SYNC_PATH_DIFF_MODE),
  conflictMode: lowerCaseEnum(SYNC_PATH_CONFLICT_MODE),
  filters: z.array(z.string().trim().max(SYNC_MAX_PATH_FILTER_LENGTH)).max(SYNC_MAX_PATH_FILTERS),
  scheduler: z.preprocess((value) => value || { value: 0, unit: SYNC_PATH_SCHEDULER_UNIT.DISABLED }, syncPathSchedulerSchema),
  timestamp: z.number().int(),
  enabled: z.boolean(),
  lastSync: syncPathLastSyncSchema.nullish()
})

type SyncPathSchemaOutput = z.infer<typeof syncPathSchema>
type SyncPathRequiredKey = 'mode' | 'diffMode' | 'conflictMode' | 'scheduler'

// With strictNullChecks disabled, Zod pipeline metadata makes these output keys
// optional. Restore only the fields backed by pipe or preprocess.
export type SyncPathDto = SyncPathSchemaOutput & Required<Pick<SyncPathSchemaOutput, SyncPathRequiredKey>>

export const syncPathUpdateSchema = syncPathSchema.extend({
  localPath: syncPathSchema.shape.localPath.nullish(),
  remotePath: syncPathSchema.shape.remotePath.nullish(),
  timestamp: syncPathSchema.shape.timestamp.nullish()
})

type SyncPathUpdateSchemaOutput = z.infer<typeof syncPathUpdateSchema>

export type SyncPathUpdateDto = SyncPathUpdateSchemaOutput & Required<Pick<SyncPathUpdateSchemaOutput, SyncPathRequiredKey>>

export const syncPathsSchema = z.array(syncPathSchema)
