import { z } from 'zod'

export const tokenResponseSchema = z.object({
  access: z.string(),
  refresh: z.string(),
  access_expiration: z.number().int(),
  refresh_expiration: z.number().int(),
  access_2fa_expiration: z.number().int().nullish()
})

export type TokenResponseDto = z.infer<typeof tokenResponseSchema>

export const tokenExpirationResponseSchema = tokenResponseSchema
  .pick({
    access_expiration: true,
    refresh_expiration: true,
    access_2fa_expiration: true
  })
  .partial()

export type TokenExpirationResponseDto = z.infer<typeof tokenExpirationResponseSchema>
