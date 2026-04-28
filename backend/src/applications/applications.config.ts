import { Type } from 'class-transformer'
import { IsDefined, IsNotEmptyObject, IsObject, ValidateNested } from 'class-validator'
import { FilesConfig } from './files/files.config'
import { AppStoreConfig } from './sync/sync.config'
import { UsersConfig } from './users/users.config'

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
