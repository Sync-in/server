/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common'
import { SpaceGuard } from '../../../spaces/guards/space.guard'
import { ONLY_OFFICE_CONTEXT } from './only-office.constants'
import { OnlyOfficeGuard } from './only-office.guard'

export const OnlyOfficeContext = () => SetMetadata(ONLY_OFFICE_CONTEXT, true)
export const OnlyOfficeEnvironment = () => {
  return applyDecorators(OnlyOfficeContext(), UseGuards(OnlyOfficeGuard, SpaceGuard))
}
