/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Transform, Type } from 'class-transformer'
import { IsDefined, IsInt, IsNotEmpty, IsNotEmptyObject, IsObject, IsOptional, IsString, ValidateIf, ValidateNested } from 'class-validator'
import { sanitizeName, sanitizePath } from '../../files/utils/files'
import { SPACE_ALIAS, SPACE_REPOSITORY } from '../constants/spaces'
import type { SpaceRootProps } from '../models/space-root-props.model'

class SpaceRootOwnerDto {
  @IsNotEmpty()
  @IsInt()
  id: number

  @IsNotEmpty()
  @IsString()
  login: string
}

export class SpaceRootFileDto {
  @IsNotEmpty()
  @IsInt()
  id: number

  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) => (value ? sanitizePath(value).replace(`${SPACE_REPOSITORY.FILES}/${SPACE_ALIAS.PERSONAL}/`, '') : ''))
  path: string
}

export class SpaceRootDto implements SpaceRootProps {
  @IsNotEmpty()
  @IsInt()
  id: number

  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) => (value ? sanitizeName(value.trim()) : ''))
  alias: string

  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) => (value ? sanitizeName(value.trim()) : ''))
  name: string

  @IsDefined()
  @IsString()
  permissions: string

  @IsOptional()
  @IsString()
  externalPath?: string

  @IsOptional()
  @ValidateIf((_, owner) => !!owner?.id)
  @IsObject()
  @ValidateNested()
  @Type(() => SpaceRootOwnerDto)
  owner?: SpaceRootOwnerDto

  @ValidateIf((_, file) => !_.externalPath && file?.id)
  // we hide file.id & file.path if not owned by the current user
  @IsNotEmptyObject()
  @IsObject()
  @ValidateNested()
  @Type(() => SpaceRootFileDto)
  file: SpaceRootFileDto
}

export class CheckRootExternalPathDto {
  @IsNotEmpty()
  @IsString()
  path: string
}
