import { Transform } from 'class-transformer'
import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator'

export class SearchSpaceDto {
  @IsString()
  @Transform(({ value }) => value.trim().toLowerCase())
  search: string

  @IsOptional()
  @IsInt()
  limit?: number = 6

  @IsOptional()
  @IsBoolean()
  shareInsidePermission?: boolean
}
