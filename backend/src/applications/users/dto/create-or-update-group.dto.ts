import { Transform } from 'class-transformer'
import { IsEnum, IsInt, IsOptional, IsString, MinLength } from 'class-validator'
import { sanitizeName } from '../../files/utils/files'
import { GROUP_VISIBILITY } from '../constants/group'

export class UserCreateOrUpdateGroupDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value ? sanitizeName(value.trim()) : ''))
  @MinLength(1)
  name?: string

  @IsOptional()
  @IsString()
  description?: string
}

export class CreateOrUpdateGroupDto extends UserCreateOrUpdateGroupDto {
  @IsOptional()
  @IsEnum(GROUP_VISIBILITY)
  visibility?: GROUP_VISIBILITY

  @IsOptional()
  @IsString()
  permissions?: string

  @IsOptional()
  @IsInt()
  parentId?: number
}
