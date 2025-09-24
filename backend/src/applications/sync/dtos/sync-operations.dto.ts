/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Transform } from 'class-transformer'
import { IsBoolean, IsDefined, IsInt, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator'
import { MakeFileDto } from '../../files/dto/file-operations.dto'
import { SyncFileStats } from '../interfaces/sync-diff.interface'
import { NormalizedMap } from '../utils/normalizedMap'

export class SyncDiffDto {
  @IsDefined()
  @IsBoolean()
  secureDiff: boolean

  @IsDefined()
  @IsBoolean()
  firstSync: boolean

  @IsDefined()
  @IsString({ each: true })
  @Transform(({ value }) => new Set(value))
  defaultFilters: Set<string>

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.length > 0 ? new RegExp(value, 'i') : null))
  pathFilters?: RegExp = null

  @IsOptional()
  @IsObject()
  @Transform(({ value }): NormalizedMap<string, SyncFileStats> => new NormalizedMap(Object.entries(value)))
  snapshot?: Map<string, SyncFileStats>
}

export class SyncPropsDto {
  @IsDefined()
  @IsInt()
  mtime: number
}

export class SyncMakeDto extends MakeFileDto {
  @IsDefined()
  @IsInt()
  mtime: number
}

export class SyncCopyMoveDto {
  @IsString()
  @IsNotEmpty()
  destination: string

  @IsOptional()
  @IsInt()
  mtime?: number
}
