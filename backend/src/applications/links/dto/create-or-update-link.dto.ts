import { Transform } from 'class-transformer'
import { IsBoolean, IsDate, IsOptional, IsString, MinLength } from 'class-validator'
import { currentDate } from '../../../common/shared'
import { USER_PASSWORD_MIN_LENGTH } from '../../users/constants/user'

export class CreateOrUpdateLinkDto {
  @IsOptional()
  @IsString()
  uuid?: string

  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsString()
  email?: string

  @IsOptional()
  @IsString()
  language?: string

  @IsOptional()
  @Transform(({ value }) => value || 0)
  limitAccess?: number

  @IsOptional()
  @Transform(({ value }) => (value ? currentDate(value) : null))
  @IsDate()
  expiresAt?: Date

  @IsOptional()
  @Transform(({ value }) => !!value)
  @IsBoolean()
  requireAuth?: boolean

  @IsOptional()
  @Transform(({ value }) => !!value)
  @IsBoolean()
  isActive?: boolean

  @IsOptional()
  @IsString()
  permissions?: string

  @IsOptional()
  @IsString()
  @MinLength(USER_PASSWORD_MIN_LENGTH)
  password?: string

  // used for update link from links component
  @IsOptional()
  @IsString()
  shareName?: string

  // used for update link from links component
  @IsOptional()
  @IsString()
  shareDescription?: string
}
