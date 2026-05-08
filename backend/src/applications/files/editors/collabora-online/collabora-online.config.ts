import { IsBoolean, IsOptional, IsString } from 'class-validator'

export class CollaboraOnlineConfig {
  @IsBoolean()
  enabled = false

  @IsOptional()
  @IsString()
  externalServer: string = null
}
