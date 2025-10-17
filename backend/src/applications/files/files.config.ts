/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Type } from 'class-transformer'
import { IsBoolean, IsInt, IsNotEmpty, IsNotEmptyObject, IsOptional, IsString, ValidateIf, ValidateNested } from 'class-validator'

export class FilesOnlyOfficeConfig {
  @IsBoolean()
  enabled = false

  @IsOptional()
  @IsString()
  externalServer: string = null

  @ValidateIf((o: FilesOnlyOfficeConfig) => o.enabled)
  @IsString()
  @IsNotEmpty()
  secret: string

  @IsBoolean()
  verifySSL: boolean = false
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

  @IsBoolean()
  contentIndexing: boolean = true

  @IsBoolean()
  showHiddenFiles: boolean = false

  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => FilesOnlyOfficeConfig)
  onlyoffice: FilesOnlyOfficeConfig = new FilesOnlyOfficeConfig()
}
