/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Transform, Type } from 'class-transformer'
import { IsArray, IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, ValidateIf, ValidateNested } from 'class-validator'
import { FileSpace } from '../../files/interfaces/file-space.interface'
import { sanitizeName, sanitizePath } from '../../files/utils/files'
import { CreateOrUpdateLinkDto } from '../../links/dto/create-or-update-link.dto'
import { MEMBER_TYPE, MEMBER_TYPE_REVERSE } from '../../users/constants/member'
import { SHARE_TYPE } from '../constants/shares'

export class ShareMemberDto {
  @IsNotEmpty()
  @IsInt()
  id: number

  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) => MEMBER_TYPE_REVERSE[value])
  type: MEMBER_TYPE

  @IsOptional()
  @IsString()
  permissions?: string = ''

  @IsOptional()
  @IsInt()
  linkId?: number

  // used only to update the link
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateOrUpdateLinkDto)
  linkSettings?: CreateOrUpdateLinkDto = null
}

export class ShareFileSpaceRootDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value ? sanitizeName(value.trim()) : ''))
  alias: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value ? sanitizeName(value.trim()) : ''))
  name: string
}

export class ShareFileSpaceDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value ? value.trim() : ''))
  alias: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value ? value.trim() : ''))
  name: string

  @IsOptional()
  @ValidateNested()
  @Type(() => ShareFileSpaceRootDto)
  root: ShareFileSpaceRootDto
}

export class ShareParentDto {
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) => (value ? value.trim() : ''))
  alias: string
}

export class ShareFileDto implements Omit<FileSpace, 'mime' | 'name' | 'inTrash' | 'isDir'> {
  @IsNotEmpty()
  @IsInt()
  id: number

  @ValidateIf((_, ownerId) => ownerId === null || typeof ownerId === 'number')
  ownerId: number

  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) => sanitizePath(value))
  path: string

  @IsOptional()
  @IsString()
  permissions?: string

  @IsOptional()
  @ValidateNested()
  @Type(() => ShareFileSpaceDto)
  space: ShareFileSpaceDto
}

export class CreateOrUpdateShareDto {
  @IsOptional()
  @IsInt()
  id?: number

  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) => (value ? sanitizeName(value.trim()) : ''))
  name: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value ? sanitizeName(value.trim()) : ''))
  alias?: string

  @IsOptional()
  @IsEnum(SHARE_TYPE)
  type?: SHARE_TYPE

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsString()
  externalPath?: string = null

  @IsOptional()
  @IsBoolean()
  enabled?: boolean

  @IsOptional()
  @ValidateNested()
  @Type(() => ShareParentDto)
  parent?: ShareParentDto

  @IsOptional()
  @ValidateIf((_, file) => !_.externalPath && file?.id)
  @ValidateNested()
  @Type(() => ShareFileDto)
  file?: ShareFileDto

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShareMemberDto)
  // contains members (users, guests, links, groups, personal groups)
  members?: ShareMemberDto[] = []

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShareMemberDto)
  // contains links
  links?: ShareMemberDto[] = []
}
