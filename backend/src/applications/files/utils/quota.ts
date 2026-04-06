import { SpaceEnv } from '../../spaces/models/space-env.model'
import { CACHE_QUOTA_EVENT_UPDATE_PREFIX, CACHE_QUOTA_PREFIX } from '../constants/cache'
import { FILE_REPOSITORY } from '../constants/operations'
import { SpaceToFileRepository } from '../events/files-events.utils'

export function genQuotaCacheKey(id: number, type: FILE_REPOSITORY, isEventUpdate = false): string {
  return `${isEventUpdate ? CACHE_QUOTA_EVENT_UPDATE_PREFIX : CACHE_QUOTA_PREFIX}-${type}-${id}`
}

export function quotaCacheKeyFromSpace(userId: number, space: SpaceEnv, isEventUpdate = false): string | null {
  const repository: { id: number; type: FILE_REPOSITORY } = SpaceToFileRepository(userId, space)
  return repository === null ? null : genQuotaCacheKey(repository.id, repository.type, isEventUpdate)
}
