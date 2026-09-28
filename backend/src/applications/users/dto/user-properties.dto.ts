import { Transform } from 'class-transformer'
import { IsBoolean, IsDate, IsDefined, IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator'
import { AUTH_SCOPE } from '../../../authentication/constants/scope'
import { currentDate } from '../../../common/shared'
import { COLLABORA_EDITOR } from '../../files/editors/collabora-online/collabora-online.constants'
import { EURO_OFFICE_EDITOR, ONLY_OFFICE_EDITOR } from '../../files/editors/only-office/only-office.constants'
import { USER_PASSWORD_MIN_LENGTH } from '../constants/user'
import { USER_THEME } from '../constants/user-preferences'
import type { UserPreferences } from '../interfaces/user-preferences.interface'

export class UserLanguageDto {
  @ValidateIf((_, language) => language === null || typeof language === 'string')
  language: string | null
}

export class UserNotificationDto {
  @IsNotEmpty()
  @IsInt()
  notification: number
}

export class UserStorageIndexingDto {
  @IsDefined()
  @IsBoolean()
  storageIndexing: boolean
}

export class UserPreferencesDto implements Partial<UserPreferences> {
  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(USER_THEME)
  theme?: UserPreferences['theme']

  @ValidateIf((_, value) => value !== undefined)
  @IsIn([COLLABORA_EDITOR, ONLY_OFFICE_EDITOR, EURO_OFFICE_EDITOR, null])
  editor?: UserPreferences['editor']
}

export class UserUpdatePasswordDto {
  @IsNotEmpty()
  @IsString()
  oldPassword: string

  @IsNotEmpty()
  @IsString()
  @MinLength(USER_PASSWORD_MIN_LENGTH)
  newPassword: string
}

export class UserPasswordDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(USER_PASSWORD_MIN_LENGTH)
  password: string
}

export class UserAppPasswordDto {
  @IsNotEmpty()
  @IsString()
  name: string

  @Transform(({ value }) => value.toLowerCase())
  @IsEnum(AUTH_SCOPE)
  app: AUTH_SCOPE

  @IsOptional()
  @Transform(({ value }) => (value ? currentDate(value) : null))
  @IsDate()
  expiration?: Date
}
