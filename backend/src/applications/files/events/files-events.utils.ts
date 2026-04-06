import { FILE_REPOSITORY } from '../constants/operations'
import type { SpaceEnv } from '../../spaces/models/space-env.model'

export function SpaceToFileRepository(userId: number, space: SpaceEnv): { id: number; type: FILE_REPOSITORY } | null {
  if (space.inPersonalSpace) {
    // Personal user space
    return { id: userId, type: FILE_REPOSITORY.USER }
  } else if (space.root?.externalPath) {
    // External paths used as shares or as space roots share the same quota as their origin
    if (space.inSharesRepository) {
      return { id: space.root?.externalParentShareId || space.id, type: FILE_REPOSITORY.SHARE }
    }
    return { id: space.id, type: FILE_REPOSITORY.SPACE }
  } else if (space.root?.file?.path && space.root.owner?.login) {
    // Space root is linked to a user file
    return { id: space.root.owner.id, type: FILE_REPOSITORY.USER }
  } else if (space.root?.file?.space?.id) {
    return { id: space.root.file.space.id, type: FILE_REPOSITORY.SPACE }
  } else if (space.id) {
    return { id: space.id, type: FILE_REPOSITORY.SPACE }
  } else {
    return null
  }
}
