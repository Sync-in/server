/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Transform, Type } from 'class-transformer'
import { ArrayMinSize, IsArray, IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator'
import { sanitizeName } from '../../files/utils/files'
import { CreateOrUpdateLinkDto } from '../../links/dto/create-or-update-link.dto'
import { MEMBER_TYPE, MEMBER_TYPE_REVERSE } from '../../users/constants/member'
import { SPACE_ROLE } from '../constants/spaces'
import { SpaceRootDto } from './space-roots.dto'

export class SpaceMemberDto {
  @IsNotEmpty()
  @IsInt()
  id: number

  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) => MEMBER_TYPE_REVERSE[value])
  type: MEMBER_TYPE

  @IsNotEmpty()
  @IsInt()
  spaceRole?: SPACE_ROLE = SPACE_ROLE.IS_MEMBER

  @IsOptional()
  @IsString()
  permissions?: string = ''

  @IsOptional()
  @IsInt()
  linkId?: number

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateOrUpdateLinkDto)
  linkSettings?: CreateOrUpdateLinkDto = null
}

export class CreateOrUpdateSpaceDto {
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
  @IsString()
  description?: string

  @IsOptional()
  @IsBoolean()
  enabled?: boolean

  @IsOptional()
  @IsInt()
  storageQuota?: number = null

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SpaceRootDto)
  roots?: SpaceRootDto[]

  @IsArray()
  @ArrayMinSize(1)
  @Transform(({ value }) =>
    value.map((m: SpaceMemberDto) => {
      m.spaceRole = SPACE_ROLE.IS_MANAGER
      return m
    })
  )
  @ValidateNested({ each: true })
  @Type(() => SpaceMemberDto)
  // contains managers (users)
  managers: SpaceMemberDto[]

  @IsOptional()
  @IsArray()
  @Transform(({ value }) =>
    value.map((m: SpaceMemberDto) => {
      m.spaceRole = SPACE_ROLE.IS_MEMBER
      return m
    })
  )
  @ValidateNested({ each: true })
  @Type(() => SpaceMemberDto)
  // contains members (users, guests, groups, personal groups)
  members?: SpaceMemberDto[]

  @IsOptional()
  @IsArray()
  @Transform(({ value }) =>
    value.map((m: SpaceMemberDto) => {
      m.spaceRole = SPACE_ROLE.IS_MEMBER
      return m
    })
  )
  @ValidateNested({ each: true })
  @Type(() => SpaceMemberDto)
  // contains links
  links?: SpaceMemberDto[]
}
