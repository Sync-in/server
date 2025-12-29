/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common'
import { SpaceGuard } from '../../../spaces/guards/space.guard'
import { COLLABORA_CONTEXT } from './collabora-online.constants'
import { CollaboraOnlineGuard } from './collabora-online.guard'

export const CollaboraOnlineContext = () => SetMetadata(COLLABORA_CONTEXT, true)
export const CollaboraOnlineEnvironment = () => {
  return applyDecorators(CollaboraOnlineContext(), UseGuards(CollaboraOnlineGuard, SpaceGuard))
}
