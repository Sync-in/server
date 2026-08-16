import { HttpStatus } from '@nestjs/common'
import fs from 'fs/promises'
import path from 'node:path'
import { FileDBProps } from '../../files/interfaces/file-db-props.interface'
import { FileProps } from '../../files/interfaces/file-props.interface'
import { FileError } from '../../files/models/file-error'
import { TEMPORARY_PATH } from '../../files/constants/files'
import { isInternalTemporaryEntry, isInternalTemporaryPath, isPathInside } from '../../files/utils/files'
import { UserModel } from '../../users/models/user.model'
import { SPACE_REPOSITORY } from '../constants/spaces'
import { SpaceEnv } from '../models/space-env.model'
import { SpaceModel } from '../models/space.model'

export async function IsRealPathIsDirAndExists(rPath: string) {
  try {
    const stats = await fs.stat(rPath)
    if (!stats.isDirectory()) {
      throw new FileError(HttpStatus.BAD_REQUEST, 'Location is not a directory')
    }
  } catch (e) {
    if (e instanceof FileError) {
      throw new FileError(e.httpCode, e.message)
    }
    if (e.code === 'ENOENT') {
      throw new FileError(HttpStatus.NOT_FOUND, 'Location not found')
    }
    throw new FileError(HttpStatus.BAD_REQUEST, e.message)
  }
}

export function realPathFromSpace(user: UserModel, space: SpaceEnv, withBasePath: true): string[]
export function realPathFromSpace(user: UserModel, space: SpaceEnv, withBasePath?: false): string
export function realPathFromSpace(user: UserModel, space: SpaceEnv, withBasePath: boolean = false): string | string[] {
  let bPath: string
  let fPath: string[]
  if (space.inPersonalSpace) {
    // personal user space (ignore root alias)
    bPath = UserModel.getRepositoryPath(user.login, space.inTrashRepository)
    fPath = space.paths
  } else if (space.root?.externalPath) {
    // external path from space or share
    bPath = space.root.externalPath
    if (space.inSharesRepository && space.root.file?.path) {
      // child share with an external path and file.id
      fPath = [...space.root.file.path.split('/'), ...space.paths]
    } else {
      fPath = space.paths
    }
  } else if (space.root.file?.path && space.root.owner?.login) {
    // space root linked to a file in a personal space
    bPath = path.join(UserModel.getRepositoryPath(space.root.owner.login, space.root.file.inTrash), space.root.file.path)
    fPath = space.paths
  } else if (space.root.file?.space?.id) {
    // share case
    if (space.root.file.root?.id) {
      // share linked to a file in a root space with an external path or directly to the root space
      bPath = path.join(space.root.file.root.externalPath, space.root.file.path || '')
    } else {
      // share linked to a file in a space
      bPath = path.join(SpaceModel.getRepositoryPath(space.root.file.space.alias, space.root.file.inTrash), space.root.file.path || '')
    }
    fPath = space.paths
  } else if (space.alias) {
    // space files (no root)
    bPath = SpaceModel.getRepositoryPath(space.alias, space.inTrashRepository)
    fPath = [space.root.alias, ...space.paths]
  } else {
    throw new FileError(HttpStatus.NOT_FOUND, 'Space root not found')
  }
  const rPath = path.resolve(bPath, ...fPath)
  if (!isPathInside(bPath, rPath, true)) {
    throw new FileError(HttpStatus.FORBIDDEN, 'Location is not allowed')
  }
  const externalBasePathContainsInternalEntry =
    Boolean(space.root?.externalPath || space.root?.file?.root?.id) && path.resolve(bPath).split(path.sep).some(isInternalTemporaryEntry)
  const rootFilePathContainsInternalEntry = space.root?.file?.path?.split(/[/\\]/).some(isInternalTemporaryEntry)
  if (externalBasePathContainsInternalEntry || rootFilePathContainsInternalEntry || isInternalTemporaryPath(bPath, rPath)) {
    throw new FileError(HttpStatus.FORBIDDEN, 'Internal temporary locations are not accessible')
  }
  return withBasePath ? [bPath, rPath] : rPath
}

export interface TrashTarget {
  dbScope: Omit<FileDBProps, 'path'>
  mode: 'trash'
  path: string
  temporaryRoot: string
}

export interface PermanentDeleteTarget {
  mode: 'permanent'
  reason: 'external-share'
}

export type TrashTargetResolution = TrashTarget | PermanentDeleteTarget

export function trashTargetFromSpace(user: UserModel, space: SpaceEnv): TrashTargetResolution | null {
  const baseDbScope: Omit<FileDBProps, 'path'> = {
    ownerId: null,
    spaceId: null,
    spaceExternalRootId: null,
    shareExternalId: null,
    inTrash: true
  }
  const userTarget = (ownerId: number, login: string): TrashTarget => ({
    dbScope: { ...baseDbScope, ownerId },
    mode: 'trash',
    path: UserModel.getTrashPath(login),
    temporaryRoot: temporaryRootFromStorage(UserModel.getHomePath(login), user.id)
  })
  const spaceTarget = (spaceId: number, alias: string): TrashTarget => ({
    dbScope: { ...baseDbScope, spaceId },
    mode: 'trash',
    path: SpaceModel.getTrashPath(alias),
    temporaryRoot: SpaceModel.getUserTmpPath(alias, user.id)
  })

  if (space.inPersonalSpace) {
    // personal user space
    return userTarget(user.id, user.login)
  } else if (space.root?.externalPath) {
    // external path from space or share
    // space case: use the space trash
    if (space.root.file?.space?.alias) {
      return spaceTarget(space.root.file.space.id, space.root.file.space.alias)
    } else if (space.inFilesRepository && !space.inSharesRepository) {
      return spaceTarget(space.id, space.alias)
    }
    // external shares have no managed owner and are deleted permanently
    if (space.inSharesRepository) {
      return { mode: 'permanent', reason: 'external-share' }
    }
    return null
  } else if (space.root?.file?.path && space.root.owner?.login) {
    // space root is linked to a file in a personal space
    return userTarget(space.root.owner.id, space.root.owner.login)
  } else if (space.root?.file?.space?.id) {
    // share linked to a space (with an external path or not)
    return spaceTarget(space.root.file.space.id, space.root.file.space.alias)
  } else if (space.alias) {
    // space files (no root)
    return spaceTarget(space.id, space.alias)
  }
  return null
}

export function temporaryRootFromStorage(storageRoot: string, userId: number): string {
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new FileError(HttpStatus.BAD_REQUEST, 'Invalid temporary-file owner')
  }
  const rootPath = path.resolve(storageRoot)
  const usersTmpPath = path.resolve(rootPath, TEMPORARY_PATH.STORAGE, TEMPORARY_PATH.ACTORS)
  const userTmpPath = path.resolve(usersTmpPath, String(userId))
  if (!isPathInside(rootPath, usersTmpPath) || !isPathInside(usersTmpPath, userTmpPath)) {
    throw new FileError(HttpStatus.FORBIDDEN, 'Temporary location is not allowed')
  }
  return userTmpPath
}

export function temporaryRootFromSpace(user: UserModel, space: SpaceEnv): string {
  // resolve an actor-isolated temporary directory on the same storage as the target
  if (space.inPersonalSpace) {
    return temporaryRootFromStorage(UserModel.getHomePath(user.login), user.id)
  }
  if (space.root?.externalPath) {
    return temporaryRootFromStorage(space.root.externalPath, user.id)
  }
  if (space.root?.file?.path && space.root.owner?.login) {
    return temporaryRootFromStorage(UserModel.getHomePath(space.root.owner.login), user.id)
  }
  if (space.root?.file?.space?.id) {
    if (space.root.file.root?.id) {
      return temporaryRootFromStorage(space.root.file.root.externalPath, user.id)
    }
    return SpaceModel.getUserTmpPath(space.root.file.space.alias, user.id)
  }
  if (space.alias) {
    return SpaceModel.getUserTmpPath(space.alias, user.id)
  }
  throw new FileError(HttpStatus.NOT_FOUND, 'Space root not found')
}

export function realPathFromRootFile(f: FileProps): string {
  // get realpath
  if (f.origin) {
    // share case (the order of the tests is important)
    if (f.origin.ownerLogin) {
      return path.join(UserModel.getRepositoryPath(f.origin.ownerLogin, f.inTrash), f.path)
    } else if (f.root.externalPath) {
      // in case of share child from a share with external path, child share should have an external path and a fileId (file path)
      return path.join(f.root.externalPath, f.path || '')
    } else if (f.origin.spaceRootExternalPath) {
      return path.join(f.origin.spaceRootExternalPath, f.path)
    } else if (f.origin.spaceAlias) {
      return path.join(SpaceModel.getRepositoryPath(f.origin.spaceAlias, f.inTrash), f.path)
    }
  } else {
    // space case
    if (f.root.owner.login) {
      return path.join(UserModel.getRepositoryPath(f.root.owner.login, f.inTrash), f.path)
    } else if (f.root.externalPath) {
      return f.root.externalPath
    }
  }
  return undefined
}

export function dbFileFromSpace(userId: number, space: SpaceEnv): FileDBProps {
  const dbFile: FileDBProps = {} as any
  dbFile.inTrash = space.repository === SPACE_REPOSITORY.TRASH
  if (space.inPersonalSpace) {
    // personal user space (ignore root alias)
    dbFile.ownerId = userId
    dbFile.path = path.join(...space.paths)
    dbFile.inTrash = space.inTrashRepository
  } else if (space.root?.externalPath) {
    // external path from space or share
    dbFile.spaceId = space.inSharesRepository ? null : space.id
    dbFile.spaceExternalRootId = space.inSharesRepository ? null : space.root.id
    if (space.inSharesRepository) {
      // in this case space.id is the share.id
      // if the `externalParentShareId` property is defined, it's an external child share that must use the parent id
      dbFile.shareExternalId = space.root?.externalParentShareId ? space.root.externalParentShareId : space.id
    } else {
      dbFile.shareExternalId = null
    }
    if (space.inSharesRepository && space.root.file?.path) {
      // child share with an external path and file.id
      dbFile.path = path.join(space.root.file.path, ...space.paths)
    } else {
      dbFile.path = path.join(...space.paths)
    }
  } else if (space.root.file?.path && space.root.owner?.login) {
    // space root linked to a file in a personal space
    dbFile.ownerId = space.root.owner.id
    dbFile.inTrash = space.root.file.inTrash
    dbFile.path = path.join(space.root.file.path, ...space.paths)
  } else if (space.root.file?.space?.id) {
    // share linked to a file in a space file or an external space root
    dbFile.spaceId = space.root.file.space.id
    dbFile.spaceExternalRootId = space.root.file.root?.id || null
    dbFile.shareExternalId = null
    if (space.root.file.id) {
      dbFile.inTrash = space.root.file.inTrash
    }
    dbFile.path = path.join(space.root.file.path || '', ...space.paths)
  } else if (space.id) {
    // space files (no root)
    dbFile.spaceId = space.id
    dbFile.spaceExternalRootId = null
    dbFile.path = path.join(space.root.alias, ...space.paths)
    dbFile.inTrash = space.inTrashRepository
  } else {
    throw new FileError(HttpStatus.NOT_FOUND, 'Space root not found')
  }
  return dbFile
}
