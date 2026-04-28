import { IsBoolean } from 'class-validator'

export class UsersConfig {
  @IsBoolean()
  showUngroupedUsers = true
}
