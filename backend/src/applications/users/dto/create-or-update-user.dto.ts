import { Transform } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength
} from 'class-validator'
import { USER_GROUP_ROLE, USER_LOGIN_VALIDATION, USER_NOTIFICATION, USER_PASSWORD_MIN_LENGTH, USER_ROLE } from '../constants/user'

export class OptionalUserDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value ? value.trim() : ''))
  @MaxLength(255)
  lastName?: string

  @IsOptional()
  @IsEnum(USER_ROLE)
  role?: USER_ROLE

  @IsOptional()
  @IsBoolean()
  isActive?: boolean

  @IsOptional()
  @IsString()
  language?: string

  @IsOptional()
  @IsEnum(USER_NOTIFICATION)
  notification?: USER_NOTIFICATION

  @IsOptional()
  @IsString()
  permissions?: string

  @IsOptional()
  @IsInt()
  storageQuota?: number

  // for users
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  groups?: number[]

  // for guests
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  managers?: number[]
}

export class CreateUserDto extends OptionalUserDto {
  @IsNotEmpty()
  @Transform(({ value }) => (value ? value.trim() : ''))
  @MinLength(2)
  @MaxLength(255)
  @Matches(USER_LOGIN_VALIDATION)
  login: string

  @IsNotEmpty()
  @Transform(({ value }) => (value ? value.trim() : ''))
  @IsEmail()
  @MinLength(2)
  @MaxLength(255)
  email: string

  @IsString()
  @MinLength(USER_PASSWORD_MIN_LENGTH)
  @MaxLength(255)
  password: string

  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => (value ? value.trim() : ''))
  firstName: string
}

export class UpdateUserDto extends OptionalUserDto {
  @IsOptional()
  @Transform(({ value }) => (value ? value.trim() : ''))
  @MinLength(2)
  @MaxLength(255)
  @Matches(USER_LOGIN_VALIDATION)
  login?: string

  @IsOptional()
  @Transform(({ value }) => (value ? value.trim() : ''))
  @IsEmail()
  @MinLength(2)
  @MaxLength(255)
  email?: string

  @IsOptional()
  @IsString()
  @MinLength(USER_PASSWORD_MIN_LENGTH)
  @MaxLength(255)
  password?: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value ? value.trim() : ''))
  @MaxLength(255)
  firstName?: string
}

export class UpdateUserFromGroupDto {
  @IsInt()
  @Min(USER_GROUP_ROLE.MEMBER)
  @Max(USER_GROUP_ROLE.MANAGER)
  role: USER_GROUP_ROLE
}
