import { IsInt, IsOptional, IsString } from 'class-validator'

export class TokenResponseDto {
  @IsString()
  access: string

  @IsString()
  refresh: string

  @IsInt()
  access_expiration: number

  @IsInt()
  refresh_expiration: number

  @IsOptional()
  @IsInt()
  access_2fa_expiration?: number
}
