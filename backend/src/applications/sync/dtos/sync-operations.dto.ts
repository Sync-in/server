import { z } from 'zod'
import { makeFileSchema } from '../../files/dto/file-operations.dto.js'
import type { SyncFileStats } from '../interfaces/sync-diff.interface.js'
import { transformPathFilters } from '../utils/functions.js'
import { NormalizedMap } from '../utils/normalizedMap.js'

export const syncDiffSchema = z.object({
  secureDiff: z.boolean(),
  firstSync: z.boolean(),
  defaultFilters: z.array(z.string()).transform((value) => new Set(value)),
  pathFilters: z
    .string()
    .nullish()
    .transform((value) => transformPathFilters(value)),
  snapshot: z
    .record(z.string(), z.unknown())
    .transform((value) => new NormalizedMap<string, SyncFileStats>(Object.entries(value) as [string, SyncFileStats][]))
    .optional()
})

export type SyncDiffDto = z.infer<typeof syncDiffSchema>

export const syncPropsSchema = z.object({
  mtime: z.number().int()
})

export type SyncPropsDto = z.infer<typeof syncPropsSchema>

export const syncMakeSchema = makeFileSchema.extend({
  mtime: z.number().int()
})

export type SyncMakeDto = z.infer<typeof syncMakeSchema>

export const syncCopyMoveSchema = z.object({
  destination: z.string().min(1),
  mtime: z.number().int().nullish()
})

export type SyncCopyMoveDto = z.infer<typeof syncCopyMoveSchema>
