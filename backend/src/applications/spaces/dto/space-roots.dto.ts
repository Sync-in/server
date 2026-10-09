import { z } from 'zod'
import { integerNumberSchema } from '../../../configuration/config.schema.js'
import { sanitizeName, sanitizePath } from '../../files/utils/files.js'
import { SPACE_ALIAS, SPACE_REPOSITORY } from '../constants/spaces.js'
import type { SpaceRootProps } from '../models/space-root-props.model.js'

const spaceRootOwnerSchema = z.object({
  id: integerNumberSchema,
  login: z.string().min(1)
})

type SpaceRootOwnerDto = z.infer<typeof spaceRootOwnerSchema>

const conditionalSpaceRootOwnerSchema = z
  .unknown()
  .transform((owner, ctx): SpaceRootOwnerDto | null | undefined => {
    if (owner == null || !(owner as SpaceRootOwnerDto)?.id) return owner as SpaceRootOwnerDto | null | undefined
    const result = spaceRootOwnerSchema.safeParse(owner)
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({ code: 'custom', input: owner, message: issue.message, path: issue.path })
      }
      return z.NEVER
    }
    return result.data
  })
  .optional()

export const spaceRootFileSchema = z.object({
  id: integerNumberSchema,
  path: z
    .string()
    .overwrite((value) => sanitizePath(value).replace(`${SPACE_REPOSITORY.FILES}/${SPACE_ALIAS.PERSONAL}/`, ''))
    .min(1)
})

// Conditional validation receives the path already normalized by transformSpaceRootFile.
const normalizedSpaceRootFileSchema = spaceRootFileSchema.extend({ path: z.string().min(1) })

export type SpaceRootFileDto = z.infer<typeof spaceRootFileSchema>

const sanitizedRootNameSchema = z.string().trim().overwrite(sanitizeName).min(1)

const transformSpaceRootFile = (value: unknown): unknown => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value
  const file = { ...value } as Record<string, unknown>
  if ('path' in file) {
    file.path =
      typeof file.path === 'string' && file.path
        ? sanitizePath(file.path).replace(`${SPACE_REPOSITORY.FILES}/${SPACE_ALIAS.PERSONAL}/`, '')
        : file.path
          ? file.path
          : ''
  }
  return file
}

const spaceRootBaseSchema = z.object({
  id: integerNumberSchema,
  alias: sanitizedRootNameSchema,
  name: sanitizedRootNameSchema,
  permissions: z.string(),
  externalPath: z.string().nullish(),
  owner: conditionalSpaceRootOwnerSchema,
  // We intentionally defer validation: the legacy ValidateIf only validated a file
  // when it was internal and its id was visible to the current user.
  file: z.unknown().transform(transformSpaceRootFile).optional()
})

export const spaceRootSchema = spaceRootBaseSchema.transform((root, ctx): SpaceRootProps => {
  const file = root.file as SpaceRootFileDto | null | undefined
  if (!root.externalPath && file?.id) {
    const result = normalizedSpaceRootFileSchema.safeParse(file)
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({ code: 'custom', input: file, message: issue.message, path: ['file', ...issue.path] })
      }
      return z.NEVER
    }
    return { ...root, file: result.data } as SpaceRootProps
  }
  return root as SpaceRootProps
})

export type SpaceRootDto = z.infer<typeof spaceRootSchema>

export const spaceRootsSchema = z.array(spaceRootSchema)

export const checkRootExternalPathSchema = z.object({
  path: z.string().min(1)
})

export type CheckRootExternalPathDto = z.infer<typeof checkRootExternalPathSchema>
