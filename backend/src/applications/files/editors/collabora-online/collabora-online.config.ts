import { Transform } from 'class-transformer'
import { IsBoolean, IsOptional, IsUrl } from 'class-validator'

export class CollaboraOnlineConfig {
  @IsBoolean()
  enabled = false

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false, disallow_auth: true })
  externalServer: string = null
}
