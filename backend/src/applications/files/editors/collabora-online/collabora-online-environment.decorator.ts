import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common'
import { SpaceGuard } from '../../../spaces/guards/space.guard.js'
import { COLLABORA_CONTEXT } from './collabora-online.constants.js'
import { CollaboraOnlineGuard } from './collabora-online.guard.js'

export const CollaboraOnlineContext = () => SetMetadata(COLLABORA_CONTEXT, true)
export const CollaboraOnlineEnvironment = () => {
  return applyDecorators(CollaboraOnlineContext(), UseGuards(CollaboraOnlineGuard, SpaceGuard))
}
