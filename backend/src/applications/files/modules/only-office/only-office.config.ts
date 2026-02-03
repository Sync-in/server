import { IsBoolean, IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator'

export class OnlyOfficeConfig {
  @IsBoolean()
  enabled = false

  @IsOptional()
  @IsString()
  externalServer: string = null

  @ValidateIf((o: OnlyOfficeConfig) => o.enabled)
  @IsString()
  @IsNotEmpty()
  secret: string

  @IsBoolean()
  verifySSL: boolean = false
}
