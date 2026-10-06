import { Type } from 'class-transformer'
import { IsDefined, IsNotEmptyObject, IsObject, ValidateNested } from 'class-validator'
import { FilesConfig } from './files/files.config.js'
import { AppStoreConfig } from './sync/sync.config.js'
import { UsersConfig } from './users/users.config.js'

export class ApplicationsConfig {
  @IsDefined()
  @IsObject()
  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => FilesConfig)
  files: FilesConfig

  @IsDefined()
  @IsObject()
  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => UsersConfig)
  users: UsersConfig = new UsersConfig()

  @IsDefined()
  @IsObject()
  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => AppStoreConfig)
  appStore: AppStoreConfig = new AppStoreConfig()
}
