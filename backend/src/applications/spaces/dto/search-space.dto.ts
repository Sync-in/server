import { z } from 'zod'

export const searchSpaceSchema = z.object({
  search: z.string().trim().toLowerCase(),
  limit: z.number().int().nullish().default(6),
  shareInsidePermission: z.boolean().nullish()
})

export type SearchSpaceDto = z.input<typeof searchSpaceSchema>
export type ValidatedSearchSpaceDto = z.output<typeof searchSpaceSchema>
