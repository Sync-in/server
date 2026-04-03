import { SpaceEnv } from '../../spaces/models/space-env.model'
import { CACHE_QUOTA_SHARE_PREFIX, CACHE_QUOTA_SPACE_PREFIX, CACHE_QUOTA_USER_PREFIX } from '../constants/cache'

export function quotaCacheKeyFromSpace(userId: number, space: SpaceEnv) {
  if (space.inPersonalSpace) {
    // Personal user space
    return `${CACHE_QUOTA_USER_PREFIX}-${userId}`
  } else if (space.root?.externalPath) {
    // External paths used as shares or as space roots share the same quota as their origin
    if (space.inSharesRepository) {
      return `${CACHE_QUOTA_SHARE_PREFIX}-${space.root?.externalParentShareId || space.id}`
    }
    return `${CACHE_QUOTA_SPACE_PREFIX}-${space.id}`
  } else if (space.root.file?.path && space.root.owner?.login) {
    // Space root is linked to a user file
    return `${CACHE_QUOTA_USER_PREFIX}-${space.root.owner.id}`
  } else if (space.root.file?.space?.id) {
    return `${CACHE_QUOTA_SPACE_PREFIX}-${space.root.file.space.id}`
  } else if (space.id) {
    return `${CACHE_QUOTA_SPACE_PREFIX}-${space.id}`
  } else {
    return null
  }
}
