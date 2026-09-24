import { Transform } from 'class-transformer'
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUrl, ValidateIf } from 'class-validator'

export class OnlyOfficeConfig {
  @IsBoolean()
  enabled = false

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false, disallow_auth: true })
  externalServer: string = null

  @ValidateIf((o: OnlyOfficeConfig) => o.enabled)
  @IsString()
  @IsNotEmpty()
  secret: string

  @IsBoolean()
  verifySSL: boolean = false
}
