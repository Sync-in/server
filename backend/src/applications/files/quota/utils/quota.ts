import { SpaceEnv } from '../../../spaces/models/space-env.model.js'
import { CACHE_QUOTA_EVENT_UPDATE_PREFIX, CACHE_QUOTA_PREFIX } from '../../core/constants/cache.js'
import { FILE_REPOSITORY } from '../../core/constants/operations.js'
import { SpaceToFileRepository } from '../../core/events/files-events.utils.js'

export function genQuotaCacheKey(id: number, type: FILE_REPOSITORY, isEventUpdate = false): string {
  return `${isEventUpdate ? CACHE_QUOTA_EVENT_UPDATE_PREFIX : CACHE_QUOTA_PREFIX}-${type}-${id}`
}

export function quotaCacheKeyFromSpace(userId: number, space: SpaceEnv, isEventUpdate = false): string | null {
  const repository = SpaceToFileRepository(userId, space)
  return repository === null ? null : genQuotaCacheKey(repository.id, repository.type, isEventUpdate)
}
