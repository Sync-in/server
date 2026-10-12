import { z } from 'zod'

export const deleteSpaceSchema = z.object({
  deleteNow: z.boolean().nullish()
})

export type DeleteSpaceDto = z.infer<typeof deleteSpaceSchema>
