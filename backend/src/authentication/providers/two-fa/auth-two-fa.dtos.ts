import { z } from 'zod'
import type { LoginResponseDto } from '../../dto/login-response.dto.js'

export type TwoFaResponseDto = LoginResponseDto & {
  success: boolean
  message: string
}

export const twoFaVerifySchema = z.object({
  code: z.string().min(1),
  isRecoveryCode: z.boolean().nullish()
})

export type TwoFaVerifyDto = z.infer<typeof twoFaVerifySchema>

export const twoFaVerifyWithPasswordSchema = twoFaVerifySchema.extend({
  password: z.string().min(1)
})

export type TwoFaVerifyWithPasswordDto = z.infer<typeof twoFaVerifyWithPasswordSchema>
