import { Transform } from 'class-transformer'
import { IsBoolean, IsDate, IsDefined, IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator'
import { AUTH_SCOPE } from '../../../authentication/constants/scope.js'
import { currentDate } from '../../../common/shared.js'
import { COLLABORA_EDITOR } from '../../files/editors/collabora-online/collabora-online.constants.js'
import { EURO_OFFICE_EDITOR, ONLY_OFFICE_EDITOR } from '../../files/editors/only-office/only-office.constants.js'
import { USER_PASSWORD_MIN_LENGTH } from '../constants/user.js'
import { USER_SIDEBAR_QUICK_ACCESS_POSITION, USER_SIDEBAR_QUICK_ACCESS_VISIBILITY, USER_THEME } from '../constants/user-preferences.js'
import type { UserPreferences } from '../interfaces/user-preferences.interface.js'

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

  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  useSystemNotifications?: UserPreferences['useSystemNotifications']

  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(USER_SIDEBAR_QUICK_ACCESS_VISIBILITY)
  sidebarQuickAccessVisibility?: UserPreferences['sidebarQuickAccessVisibility']

  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(USER_SIDEBAR_QUICK_ACCESS_POSITION)
  sidebarQuickAccessPosition?: UserPreferences['sidebarQuickAccessPosition']
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
