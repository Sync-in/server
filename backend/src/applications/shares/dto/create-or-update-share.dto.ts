import { z } from 'zod'
import { integerNumberSchema } from '../../../configuration/config.schema.js'
import { sanitizeName, sanitizePath } from '../../files/utils/files.js'
import { createOrUpdateLinkSchema } from '../../links/dto/create-or-update-link.dto.js'
import { MEMBER_TYPE, MEMBER_TYPE_REVERSE } from '../../users/constants/member.js'
import type { Member } from '../../users/interfaces/member.interface.js'
import { SHARE_TYPE } from '../constants/shares.js'

const shareMemberTypeSchema = z.enum(MEMBER_TYPE).overwrite((value) => MEMBER_TYPE_REVERSE[value])

export const shareMemberSchema = z.object({
  id: integerNumberSchema,
  type: shareMemberTypeSchema,
  permissions: z.string().nullish().default(''),
  linkId: integerNumberSchema.nullish(),
  // used only to update the link
  linkSettings: createOrUpdateLinkSchema.nullish().default(null)
})

export type ShareMemberDto = z.output<typeof shareMemberSchema>

export type ShareMemberInputDto = Pick<Member, 'id' | 'type'> & {
  permissions?: string | null
  linkId?: number | null
  linkSettings?: Member['linkSettings'] | null
}

// File properties are normalized by transformShareFile before these schemas validate them.
const optionalFileNameSchema = z.string().optional()

export const shareFileSpaceRootSchema = z.object({
  alias: optionalFileNameSchema,
  name: optionalFileNameSchema
})

export const shareFileSpaceSchema = z.object({
  alias: optionalFileNameSchema,
  name: optionalFileNameSchema,
  root: shareFileSpaceRootSchema.nullish()
})

export const shareParentSchema = z.object({
  alias: z.string().trim().min(1)
})

export type ShareParentDto = z.infer<typeof shareParentSchema>

export const shareFileSchema = z.object({
  id: integerNumberSchema,
  ownerId: z.number().nullish(),
  path: z.string().min(1),
  permissions: z.string().nullish(),
  space: shareFileSpaceSchema.nullish()
})

export type ShareFileDto = z.infer<typeof shareFileSchema>

const sanitizedShareNameSchema = z.string().trim().overwrite(sanitizeName)
const nullableSanitizedShareNameSchema = sanitizedShareNameSchema.nullable().transform((value) => value ?? '')

const transformOptionalName = (value: unknown, sanitize: boolean): unknown => {
  if (typeof value === 'string') return value ? (sanitize ? sanitizeName(value.trim()) : value.trim()) : ''
  return value ? value : ''
}

const transformShareFile = (value: unknown): unknown => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value
  const file = { ...value } as Record<string, unknown>
  if ('path' in file && typeof file.path === 'string') file.path = sanitizePath(file.path)
  if (file.space !== null && typeof file.space === 'object' && !Array.isArray(file.space)) {
    const space = { ...file.space } as Record<string, unknown>
    if ('alias' in space) space.alias = transformOptionalName(space.alias, false)
    if ('name' in space) space.name = transformOptionalName(space.name, false)
    if (space.root !== null && typeof space.root === 'object' && !Array.isArray(space.root)) {
      const root = { ...space.root } as Record<string, unknown>
      if ('alias' in root) root.alias = transformOptionalName(root.alias, true)
      if ('name' in root) root.name = transformOptionalName(root.name, true)
      space.root = root
    }
    file.space = space
  }
  return file
}

const createOrUpdateShareBaseSchema = z.object({
  id: integerNumberSchema.nullish(),
  name: sanitizedShareNameSchema.min(1),
  alias: nullableSanitizedShareNameSchema.optional(),
  type: z.enum(SHARE_TYPE).nullish(),
  description: z.string().nullish(),
  externalPath: z.string().nullish().default(null),
  enabled: z.boolean().nullish(),
  storageQuota: integerNumberSchema.nullish().default(null),
  storageIndexing: z.boolean().nullish(),
  parent: shareParentSchema.nullish(),
  // Validation is conditional to preserve the former ValidateIf semantics.
  file: z.unknown().transform(transformShareFile).nullish(),
  // contains members (users, guests, links, groups, personal groups)
  members: z.preprocess((value) => value ?? [], z.array(shareMemberSchema)),
  // contains links
  links: z.preprocess((value) => value ?? [], z.array(shareMemberSchema))
})

type CreateOrUpdateShareSchemaOutput = Omit<z.output<typeof createOrUpdateShareBaseSchema>, 'file'> & {
  file?: ShareFileDto | null
}

export const createOrUpdateShareSchema = createOrUpdateShareBaseSchema.transform((share, ctx): CreateOrUpdateShareSchemaOutput => {
  const { externalPath, file, ...shareProps } = share
  if (externalPath) return { ...shareProps, externalPath }
  if (file === undefined) return { ...shareProps, externalPath: null }
  if (file === null) return { ...shareProps, externalPath: null, file: null }

  // External space roots have no file id; preserve the former ValidateIf(file?.id) behavior.
  const shareFile = file as ShareFileDto
  if (!shareFile.id) return { ...shareProps, externalPath: null, file: shareFile }

  const result = shareFileSchema.safeParse(file)
  if (!result.success) {
    for (const issue of result.error.issues) {
      ctx.addIssue({ code: 'custom', input: file, message: issue.message, path: ['file', ...issue.path] })
    }
    return z.NEVER
  }
  return { ...shareProps, externalPath: null, file: result.data }
})

export type CreateOrUpdateShareDto = Omit<z.input<typeof createOrUpdateShareSchema>, 'alias' | 'file' | 'members' | 'links'> & {
  alias?: string
  file?: ShareFileDto | null
  members?: ShareMemberInputDto[] | null
  links?: ShareMemberInputDto[] | null
}

export type ValidatedCreateOrUpdateShareDto = z.output<typeof createOrUpdateShareSchema>
