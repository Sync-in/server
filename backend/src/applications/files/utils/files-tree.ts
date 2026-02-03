import path from 'node:path'
import { sortObjByName } from '../../../common/functions'
import { SHARE_ALL_OPERATIONS } from '../../shares/constants/shares'
import { SPACE_ALL_OPERATIONS, SPACE_REPOSITORY } from '../../spaces/constants/spaces'
import { SpaceEnv } from '../../spaces/models/space-env.model'
import { getEnvPermissions } from '../../spaces/utils/permissions'
import { FileProps } from '../interfaces/file-props.interface'
import { FileTree } from '../interfaces/file-tree.interface'
import { dirHasChildren } from './files'

async function hasChildren(space: SpaceEnv, file: FileProps): Promise<boolean> {
  if (file.root?.alias) {
    // no need to check this
    return true
  } else if (space.realPath) {
    return await dirHasChildren(path.join(space.realPath, file.name))
  }
  // allows true by default
  return true
}

export function convertToFilesTree(space: SpaceEnv, files: FileProps[], onlyDirs = true): Promise<FileTree[]> {
  if (space.inPersonalSpace) {
    // by default personal space endpoint has no permissions but in this case the root files must have all permissions
    space.permissions = SPACE_ALL_OPERATIONS
  } else if (space.inSharesList) {
    // by default shares space endpoint has no permissions
    // we are doing an intersection of the permissions, we need to grant all permissions to reflect the rights of the shares (root files)
    space.permissions = SHARE_ALL_OPERATIONS
  }
  return Promise.all(
    files
      .filter((f) => {
        return onlyDirs ? f.isDir : true
      })
      .sort(sortObjByName)
      .map(async (f) => {
        return {
          id: f.id,
          name: f.name,
          path: path.join(space.url, f.root?.alias || f.name),
          isDir: f.isDir,
          mime: f.mime,
          hasChildren: f.isDir ? await hasChildren(space, f) : false,
          inShare: space.inSharesRepository,
          enabled: f.root ? f.root.enabled : space.enabled,
          permissions: getEnvPermissions(space, f.root),
          quotaIsExceeded: space.quotaIsExceeded
        } as FileTree
      })
  )
}

export function convertToSpacesTree(spaces: SpaceEnv[]): Promise<FileTree[]> {
  return Promise.all(
    spaces.sort(sortObjByName).map(async (space): Promise<FileTree> => {
      return {
        id: -space.id * 10, // random id must be greater than -9
        name: space.name,
        path: path.join(SPACE_REPOSITORY.FILES, space.alias),
        isDir: true,
        hasChildren: true,
        inShare: false,
        enabled: space.enabled,
        permissions: space.permissions,
        quotaIsExceeded: space.quotaIsExceeded
      } as FileTree
    })
  )
}
