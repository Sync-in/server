import { z } from 'zod'
import { integerNumberSchema } from '../../../configuration/config.schema.js'
import { sanitizeName } from '../../files/utils/files.js'
import { createOrUpdateLinkSchema } from '../../links/dto/create-or-update-link.dto.js'
import { MEMBER_TYPE, MEMBER_TYPE_REVERSE } from '../../users/constants/member.js'
import type { Member } from '../../users/interfaces/member.interface.js'
import { SPACE_ROLE } from '../constants/spaces.js'
import { spaceRootSchema } from './space-roots.dto.js'

const memberTypeSchema = z.enum(MEMBER_TYPE).overwrite((value) => MEMBER_TYPE_REVERSE[value])

export const spaceMemberSchema = z.object({
  id: integerNumberSchema,
  type: memberTypeSchema,
  spaceRole: z
    .number()
    .int()
    .transform((value) => value as SPACE_ROLE)
    .default(SPACE_ROLE.IS_MEMBER),
  permissions: z.string().nullish().default(''),
  linkId: integerNumberSchema.nullish(),
  linkSettings: createOrUpdateLinkSchema.nullish().default(null)
})

export type SpaceMemberDto = z.infer<typeof spaceMemberSchema>

export type SpaceMemberInputDto = Pick<Member, 'id' | 'type' | 'spaceRole' | 'permissions' | 'linkId' | 'linkSettings'>

const sanitizedSpaceNameSchema = z.string().trim().overwrite(sanitizeName)
const nullableSanitizedSpaceNameSchema = sanitizedSpaceNameSchema.nullable().transform((value) => value ?? '')

const membersWithRoleSchema = (spaceRole: SPACE_ROLE, minimum = 0) =>
  z.preprocess(
    (members) =>
      members == null ? [] : Array.isArray(members) ? members.map((member) => ({ ...(member as Record<string, unknown>), spaceRole })) : members,
    z.array(spaceMemberSchema).min(minimum)
  )

export const createOrUpdateSpaceSchema = z.object({
  id: integerNumberSchema.nullish(),
  name: sanitizedSpaceNameSchema.min(1),
  alias: nullableSanitizedSpaceNameSchema.optional(),
  description: z.string().nullish(),
  enabled: z.boolean().nullish(),
  storageQuota: integerNumberSchema.nullish().default(null),
  storageIndexing: z.boolean().nullish(),
  roots: z.array(spaceRootSchema).nullish(),
  // contains managers (users)
  managers: membersWithRoleSchema(SPACE_ROLE.IS_MANAGER, 1),
  // contains members (users, guests, groups, personal groups)
  members: membersWithRoleSchema(SPACE_ROLE.IS_MEMBER),
  // contains links
  links: membersWithRoleSchema(SPACE_ROLE.IS_MEMBER)
})

type CreateOrUpdateSpaceSchemaOutput = z.output<typeof createOrUpdateSpaceSchema>

export type CreateOrUpdateSpaceDto = Omit<z.input<typeof createOrUpdateSpaceSchema>, 'alias' | 'managers' | 'members' | 'links'> & {
  alias?: string
  managers: SpaceMemberInputDto[]
  members?: SpaceMemberInputDto[] | null
  links?: SpaceMemberInputDto[] | null
}

export type ValidatedCreateOrUpdateSpaceDto = CreateOrUpdateSpaceSchemaOutput & Required<Pick<CreateOrUpdateSpaceSchemaOutput, 'managers'>>
