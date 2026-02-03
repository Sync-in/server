import { IsIn, IsInt, IsNotEmpty, IsString, Min, ValidateIf } from 'class-validator'

export class CacheConfig {
  @IsString()
  @IsNotEmpty()
  @IsIn(['redis', 'mysql'])
  adapter: 'redis' | 'mysql' = 'mysql'

  @IsInt()
  @Min(1)
  ttl: number = 60 // seconds

  @ValidateIf((o: CacheConfig) => o.adapter === 'redis')
  @IsString()
  @IsNotEmpty()
  redis: string = 'redis://127.0.0.1:6379'
}
