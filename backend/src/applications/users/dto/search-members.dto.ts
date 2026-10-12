import { z } from 'zod'
import { integerNumberSchema } from '../../../configuration/config.schema.js'

export const searchMembersSchema = z.object({
  search: z
    .string()
    .trim()
    .toLowerCase()
    .nullable()
    .transform((value) => value ?? ''),
  ignoreUserIds: z.array(integerNumberSchema).nullish(),
  ignoreGroupIds: z.array(integerNumberSchema).nullish(),
  onlyUsers: z.boolean().nullish().default(false),
  onlyGroups: z.boolean().nullish().default(false),
  excludePersonalGroups: z.boolean().nullish().default(false),
  onlyPersonalGroups: z.boolean().nullish().default(false),
  isGroupManager: z.boolean().nullish().default(false),
  usersRole: z.number().int().nullish(),
  withPermissions: z.boolean().nullish().default(false)
})

type SearchMembersSchemaInput = z.input<typeof searchMembersSchema>
type SearchMembersSchemaOutput = z.output<typeof searchMembersSchema>

export type SearchMembersDto = Omit<SearchMembersSchemaInput, 'search'> & { search: string }
export type ValidatedSearchMembersDto = SearchMembersSchemaOutput & Required<Pick<SearchMembersSchemaOutput, 'search'>>
