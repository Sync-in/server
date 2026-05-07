import { Transform, Type } from 'class-transformer'
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNotEmptyObject,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
  ValidateNested
} from 'class-validator'
import { CollaboraOnlineConfig } from './editors/collabora-online/collabora-online.config'
import { OnlyOfficeConfig } from './editors/only-office/only-office.config'

export class FilesContentIndexingOCRConfig {
  @IsBoolean()
  enabled: boolean = true

  @ValidateIf((o: FilesContentIndexingOCRConfig) => o.enabled)
  @ArrayNotEmpty()
  @IsArray()
  @IsString({ each: true })
  languages: string[] = ['eng']

  @IsBoolean()
  offline: boolean = false

  @IsOptional()
  @IsString()
  languagesPath?: string
}

export class FilesContentIndexingConfig {
  @IsBoolean()
  enabled: boolean = true

  @ValidateIf((o: FilesContentIndexingConfig) => o.enabled)
  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => FilesContentIndexingOCRConfig)
  ocr: FilesContentIndexingOCRConfig = new FilesContentIndexingOCRConfig()
}

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

  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => FilesContentIndexingConfig)
  contentIndexing: FilesContentIndexingConfig = new FilesContentIndexingConfig()

  @Transform(({ value }) => (value === 0 ? false : value))
  @ValidateIf((o: FilesConfig) => o.trashRetentionDays !== false)
  @IsInt()
  @Min(1)
  trashRetentionDays: number | false = false

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
