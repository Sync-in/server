import { z } from 'zod'

export const deleteUserSchema = z.object({
  deleteSpace: z.boolean()
})

export type DeleteUserDto = z.infer<typeof deleteUserSchema>
