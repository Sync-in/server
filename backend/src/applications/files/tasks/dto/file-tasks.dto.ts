import { z } from 'zod'

export const fileTasksDeleteSchema = z.object({
  taskIds: z.array(z.string()).min(1)
})

export type FileTasksDeleteDto = z.infer<typeof fileTasksDeleteSchema>

export const fileTasksPollSchema = z.object({
  trackedIds: z.array(z.string())
})

export type FileTasksPollDto = z.infer<typeof fileTasksPollSchema>
