import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator'
import { LoginResponseDto } from '../../dto/login-response.dto'

export class TwoFaResponseDto extends LoginResponseDto {
  success: boolean
  message: string
}

export class TwoFaVerifyDto {
  @IsString()
  @IsNotEmpty()
  code!: string

  @IsOptional()
  @IsBoolean()
  isRecoveryCode?: boolean
}

export class TwoFaVerifyWithPasswordDto extends TwoFaVerifyDto {
  @IsString()
  @IsNotEmpty()
  password!: string
}
