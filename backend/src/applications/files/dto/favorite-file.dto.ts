import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class FavoriteFileDto {
  @IsOptional()
  @IsInt()
  id?: number

  @IsNotEmpty()
  @IsString()
  path: string

  @IsNotEmpty()
  @IsString()
  name: string

  @IsBoolean()
  isDir: boolean

  @IsOptional()
  @IsString()
  mime?: string

  @IsOptional()
  @IsInt()
  size?: number

  @IsOptional()
  @IsInt()
  mtime?: number

  @IsOptional()
  @IsInt()
  ctime?: number

  @IsOptional()
  @IsInt()
  ownerId?: number

  @IsOptional()
  @IsInt()
  spaceId?: number

  @IsOptional()
  @IsInt()
  spaceExternalRootId?: number

  @IsOptional()
  @IsInt()
  shareExternalId?: number
}
