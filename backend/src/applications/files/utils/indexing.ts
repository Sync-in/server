import { FILE_REPOSITORY } from '../constants/operations'
import { CACHE_INDEXING_UPDATE_PREFIX } from '../constants/indexing'
import { SpaceEnv } from '../../spaces/models/space-env.model'
import { SpaceToFileRepository } from '../events/files-events.utils'

export function genIndexingKey(id: number, type: FILE_REPOSITORY, sep = '_'): string {
  return `${type}${sep}${id}`
}

export function indexingUpdateCacheKeysFromSpace(userId: number, space: SpaceEnv): string[] {
  const cacheKeys: string[] = []
  if (space.inSharesRepository && !space.root.externalPath) {
    // shares that are linked to a space must also be indexed
    cacheKeys.push(`${CACHE_INDEXING_UPDATE_PREFIX}-${genIndexingKey(space.id, FILE_REPOSITORY.SHARE, '-')}`)
  } else if (space.inFilesRepository && space.root.owner?.login) {
    // space where the user’s root file is anchored
    cacheKeys.push(`${CACHE_INDEXING_UPDATE_PREFIX}-${genIndexingKey(space.id, FILE_REPOSITORY.SPACE, '-')}`)
  }
  const repository: { id: number; type: FILE_REPOSITORY } = SpaceToFileRepository(userId, space)
  if (repository !== null) {
    cacheKeys.push(`${CACHE_INDEXING_UPDATE_PREFIX}-${genIndexingKey(repository.id, repository.type, '-')}`)
  }
  return cacheKeys
}
