import { Transform } from 'class-transformer'
import { IsDefined, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator'

export class SyncUploadDto {
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  checksum?: string

  @IsDefined()
  @IsNotEmpty()
  @Transform(({ value }) => parseInt(value))
  @IsInt()
  mtime: number

  @IsDefined()
  @IsNotEmpty()
  @Transform(({ value }) => parseInt(value))
  @IsInt()
  @Min(0)
  size: number
}
