import { z } from 'zod'
import { hydrateConfigDefaults, integerNumberSchema, nonEmptyStringSchema } from '../../configuration/config.schema.js'
import { SAMPLE_DOCUMENT_GROUPS } from './constants/samples.js'
import { CollaboraOnlineConfigSchema } from './editors/collabora-online/collabora-online.config.js'
import { DrawioConfigSchema } from './editors/drawio/drawio.config.js'
import { OnlyOfficeConfigSchema } from './editors/only-office/only-office.config.js'

export type FilesContentIndexingOCRConfig = z.output<typeof FilesContentIndexingOCRConfigSchema>
export type FilesTrashRetentionConfig = z.output<typeof FilesTrashRetentionConfigSchema>
export type FilesConfig = z.output<typeof FilesConfigSchema>

export const FilesContentIndexingOCRConfigSchema = z.discriminatedUnion('enabled', [
  z.looseObject({
    enabled: z.literal(true).default(true),
    languages: z
      .array(z.string())
      .min(1)
      .default(() => ['eng']),
    offline: z.boolean().default(false),
    languagesPath: z.string().nullish()
  }),
  z.looseObject({
    enabled: z.literal(false),
    // Disabled OCR retains its unchecked language configuration.
    languages: z.custom<string[]>().default(() => ['eng']),
    offline: z.boolean().default(false),
    languagesPath: z.string().nullish()
  })
])

const inactiveOCRConfigSchema = z
  .custom<FilesContentIndexingOCRConfig>()
  .transform((value) => hydrateConfigDefaults(FilesContentIndexingOCRConfigSchema.parse({}), value) as FilesContentIndexingOCRConfig)
  .default(() => FilesContentIndexingOCRConfigSchema.parse({}))

export const FilesContentIndexingConfigSchema = z.discriminatedUnion('enabled', [
  z.looseObject({
    enabled: z.literal(true).default(true),
    ocr: FilesContentIndexingOCRConfigSchema.prefault({})
  }),
  z.looseObject({
    enabled: z.literal(false),
    ocr: inactiveOCRConfigSchema
  })
])

const retentionPeriodSchema = z.preprocess((value) => (value === 0 ? false : value), z.union([z.literal(false), z.number().int().min(1)]))

export const FilesTrashRetentionConfigSchema = z.looseObject({
  users: retentionPeriodSchema.default(false),
  spaces: retentionPeriodSchema.default(false)
})

export const FilesEditorsConfigSchema = z.looseObject({
  onlyoffice: OnlyOfficeConfigSchema.default(() => OnlyOfficeConfigSchema.parse({})),
  eurooffice: OnlyOfficeConfigSchema.default(() => OnlyOfficeConfigSchema.parse({})),
  collabora: CollaboraOnlineConfigSchema.prefault({}),
  drawio: DrawioConfigSchema.prefault({})
})

const sampleDocumentsSchema = z.preprocess(
  (value) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((group) => group.trim())
          .filter(Boolean)
      : value,
  z.array(z.enum(SAMPLE_DOCUMENT_GROUPS)).refine((groups) => new Set(groups).size === groups.length, { message: 'Array elements must be unique' })
)

export const FilesConfigSchema = z.looseObject({
  dataPath: nonEmptyStringSchema,
  usersPath: nonEmptyStringSchema,
  spacesPath: nonEmptyStringSchema,
  linksPath: nonEmptyStringSchema,
  maxUploadSize: integerNumberSchema.default(5368709120), // 5 GB
  contentIndexing: FilesContentIndexingConfigSchema.prefault({}),
  trashRetention: FilesTrashRetentionConfigSchema.prefault({}),
  showHiddenFiles: z.boolean().default(false),
  sampleDocuments: sampleDocumentsSchema.default(() => [...SAMPLE_DOCUMENT_GROUPS]),
  editors: FilesEditorsConfigSchema.prefault({})
})
