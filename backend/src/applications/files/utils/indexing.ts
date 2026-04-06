import { FILE_REPOSITORY } from '../constants/operations'
import { CACHE_INDEXING_UPDATE_PREFIX } from '../constants/indexing'
import { SpaceEnv } from '../../spaces/models/space-env.model'
import { SpaceToFileRepository } from '../events/files-events.utils'

export function genIndexingKey(id: number, type: FILE_REPOSITORY, sep = '_'): string {
  return `${type}${sep}${id}`
}

export function indexingUpdateCacheKeyFromSpace(userId: number, space: SpaceEnv): string | null {
  const repository: { id: number; type: FILE_REPOSITORY } = SpaceToFileRepository(userId, space)
  if (repository === null) return null
  const indexingKey = genIndexingKey(repository.id, repository.type, '-')
  return `${CACHE_INDEXING_UPDATE_PREFIX}-${indexingKey}`
}
