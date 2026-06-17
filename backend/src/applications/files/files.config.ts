import { Transform, Type } from 'class-transformer'
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNotEmptyObject,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
  ValidateNested
} from 'class-validator'
import type { SampleDocumentGroup } from './constants/samples'
import { SAMPLE_DOCUMENT_GROUPS } from './constants/samples'
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

export class FilesTrashRetentionConfig {
  @Transform(({ value }) => (value === 0 ? false : value))
  @ValidateIf((o: FilesTrashRetentionConfig) => o.users !== false)
  @IsInt()
  @Min(1)
  users: number | false = false

  @Transform(({ value }) => (value === 0 ? false : value))
  @ValidateIf((o: FilesTrashRetentionConfig) => o.spaces !== false)
  @IsInt()
  @Min(1)
  spaces: number | false = false
}

export class FilesEditorsConfig {
  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => OnlyOfficeConfig)
  onlyoffice: OnlyOfficeConfig = new OnlyOfficeConfig()

  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => OnlyOfficeConfig)
  eurooffice: OnlyOfficeConfig = new OnlyOfficeConfig()

  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => CollaboraOnlineConfig)
  collabora: CollaboraOnlineConfig = new CollaboraOnlineConfig()
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

  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => FilesTrashRetentionConfig)
  trashRetention: FilesTrashRetentionConfig = new FilesTrashRetentionConfig()

  @IsBoolean()
  showHiddenFiles: boolean = false

  @Transform(({ value }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((v: string) => v.trim())
          .filter(Boolean)
      : value
  )
  @ArrayUnique()
  @IsArray()
  @IsIn(SAMPLE_DOCUMENT_GROUPS, { each: true })
  sampleDocuments: SampleDocumentGroup[] = [...SAMPLE_DOCUMENT_GROUPS]

  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => FilesEditorsConfig)
  editors: FilesEditorsConfig = new FilesEditorsConfig()
}
