import { SpaceEnv } from '../../spaces/models/space-env.model'
import { CACHE_QUOTA_EVENT_UPDATE_PREFIX, CACHE_QUOTA_PREFIX } from '../constants/cache'
import { FILE_REPOSITORY } from '../constants/operations'

export function genQuotaCacheKey(id: number, type: FILE_REPOSITORY, isEventUpdate = false): string {
  return `${isEventUpdate ? CACHE_QUOTA_EVENT_UPDATE_PREFIX : CACHE_QUOTA_PREFIX}-${type}-${id}`
}

export function quotaCacheKeyFromSpace(userId: number, space: SpaceEnv, isEventUpdate = false): string {
  if (space.inPersonalSpace) {
    // Personal user space
    return genQuotaCacheKey(userId, FILE_REPOSITORY.USER, isEventUpdate)
  } else if (space.root?.externalPath) {
    // External paths used as shares or as space roots share the same quota as their origin
    if (space.inSharesRepository) {
      return genQuotaCacheKey(space.root?.externalParentShareId || space.id, FILE_REPOSITORY.SHARE, isEventUpdate)
    }
    return genQuotaCacheKey(space.id, FILE_REPOSITORY.SPACE, isEventUpdate)
  } else if (space.root?.file?.path && space.root.owner?.login) {
    // Space root is linked to a user file
    return genQuotaCacheKey(space.root.owner.id, FILE_REPOSITORY.USER, isEventUpdate)
  } else if (space.root?.file?.space?.id) {
    return genQuotaCacheKey(space.root.file.space.id, FILE_REPOSITORY.SPACE, isEventUpdate)
  } else if (space.id) {
    return genQuotaCacheKey(space.id, FILE_REPOSITORY.SPACE, isEventUpdate)
  } else {
    return null
  }
}
