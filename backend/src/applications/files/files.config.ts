import { Type } from 'class-transformer'
import { IsBoolean, IsInt, IsNotEmpty, IsNotEmptyObject, IsString, ValidateNested } from 'class-validator'
import { CollaboraOnlineConfig } from './modules/collabora-online/collabora-online.config'
import { OnlyOfficeConfig } from './modules/only-office/only-office.config'

export class FilesConfig {
  @IsNotEmpty()
  @IsString()
  dataPath: string

  @IsNotEmpty()
  @IsString()
  usersPath: string

  @IsNotEmpty()
  @IsString()
  spacesPath: string

  @IsNotEmpty()
  @IsString()
  tmpPath: string

  @IsInt()
  maxUploadSize: number = 5368709120 // 5 GB

  @IsBoolean()
  contentIndexing: boolean = true

  @IsBoolean()
  showHiddenFiles: boolean = false

  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => OnlyOfficeConfig)
  onlyoffice: OnlyOfficeConfig = new OnlyOfficeConfig()

  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => CollaboraOnlineConfig)
  collabora: CollaboraOnlineConfig = new CollaboraOnlineConfig()
}
