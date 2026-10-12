import { z } from 'zod'
import { regExpInvalidFileName } from '../../../common/shared.js'
import { httpUrlSchema } from '../../../configuration/config.schema.js'
import { TAR_EXTENSION, ZIP_EXTENSION } from '../constants/compress.js'
import { SEARCH_FILES_DEFAULT_LIMIT, SEARCH_FILES_MAX_LIMIT, SEARCH_FILES_MAX_QUERY_LENGTH, SEARCH_FILES_MIN_LIMIT } from '../constants/search.js'

const validFileNameSchema = z.string().refine((value) => !regExpInvalidFileName.test(value), { message: 'Forbidden characters' })

const compressFileEntrySchema = z
  .unknown()
  .refine((value) => value !== '' && value !== null && value !== undefined)
  .transform((value) => value as { name: string; rootAlias: string; path?: string })

export const copyMoveFileSchema = z.object({
  dstDirectory: z.string().min(1),
  // Renaming scenario
  dstName: validFileNameSchema.nullish(),
  overwrite: z.boolean().nullish().default(false)
})

export type CopyMoveFileDto = z.input<typeof copyMoveFileSchema>
export type ValidatedCopyMoveFileDto = z.output<typeof copyMoveFileSchema>

export const downloadFileSchema = z.object({
  url: httpUrlSchema
})

export type DownloadFileDto = z.infer<typeof downloadFileSchema>

export const makeFileSchema = z.object({
  type: z.enum(['file', 'directory'])
})

export type MakeFileDto = z.infer<typeof makeFileSchema>

export const compressFileSchema = z.object({
  name: validFileNameSchema.nullish(),
  compressInDirectory: z.boolean(),
  compression: z.boolean(),
  files: z.array(compressFileEntrySchema).min(1),
  extension: z.enum([TAR_EXTENSION, ZIP_EXTENSION])
})

export type CompressFileDto = z.infer<typeof compressFileSchema>

export const searchFilesSchema = z.object({
  content: z.string().trim().min(1).max(SEARCH_FILES_MAX_QUERY_LENGTH),
  fullText: z.boolean().nullish().default(false),
  limit: z.number().int().min(SEARCH_FILES_MIN_LIMIT).max(SEARCH_FILES_MAX_LIMIT).nullish().default(SEARCH_FILES_DEFAULT_LIMIT)
})

export type SearchFilesDto = z.input<typeof searchFilesSchema>
export type ValidatedSearchFilesDto = z.output<typeof searchFilesSchema>
