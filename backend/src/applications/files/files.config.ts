import { z } from 'zod'
import { parseTextToBytes } from '../../common/shared.js'
import { hydrateConfigDefaults, integerNumberSchema, nonEmptyStringSchema } from '../../configuration/config.schema.js'
import { SAMPLE_DOCUMENT_GROUPS } from './core/constants/samples.js'
import { CollaboraOnlineConfigSchema } from './editors/collabora-online/collabora-online.config.js'
import { DrawioConfigSchema } from './editors/drawio/drawio.config.js'
import { OnlyOfficeConfigSchema } from './editors/only-office/only-office.config.js'
import { PhotopeaConfigSchema } from './editors/photopea/photopea.config.js'

export type FilesContentIndexingOCRConfig = z.output<typeof FilesContentIndexingOCRConfigSchema>
export type FilesTrashRetentionConfig = z.output<typeof FilesTrashRetentionConfigSchema>
export type FilesConfig = z.output<typeof FilesConfigSchema>

const textByteSizeSchema = z.string().refine((value) => parseTextToBytes(value) !== undefined, { message: 'Invalid byte size' })
const byteSizeSchema = z.union([integerNumberSchema, textByteSizeSchema]).transform(byteSizeToNumber)

function byteSizeToNumber(value: number | string): number {
  return typeof value === 'number' ? value : parseTextToBytes(value)!
}

export const FilesTransfersConfigSchema = z.looseObject({
  maxUploadSize: byteSizeSchema.default(5368709120), // 5 GB
  maxChunkSize: z
    .union([byteSizeSchema, z.null()])
    .transform((value) => (value === 0 ? null : value))
    .pipe(z.number().int().min(1000000).nullable())
    .default(99614720)
})

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

export const FilesLinksConfigSchema = z.looseObject({
  sendPasswordByEmail: z.boolean().default(false)
})

export const FilesEditorsConfigSchema = z.looseObject({
  onlyoffice: OnlyOfficeConfigSchema.default(() => OnlyOfficeConfigSchema.parse({})),
  eurooffice: OnlyOfficeConfigSchema.default(() => OnlyOfficeConfigSchema.parse({})),
  collabora: CollaboraOnlineConfigSchema.prefault({}),
  drawio: DrawioConfigSchema.prefault({}),
  photopea: PhotopeaConfigSchema.prefault({})
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
  transfers: FilesTransfersConfigSchema.prefault({}),
  links: FilesLinksConfigSchema.prefault({}),
  contentIndexing: FilesContentIndexingConfigSchema.prefault({}),
  trashRetention: FilesTrashRetentionConfigSchema.prefault({}),
  sampleDocuments: sampleDocumentsSchema.default(() => [...SAMPLE_DOCUMENT_GROUPS]),
  editors: FilesEditorsConfigSchema.prefault({})
})
