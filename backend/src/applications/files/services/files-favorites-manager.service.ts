import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { SharesQueries } from '../../shares/services/shares-queries.service'
import { SPACE_ALIAS } from '../../spaces/constants/spaces'
import { SpaceEnv } from '../../spaces/models/space-env.model'
import { SpacesQueries } from '../../spaces/services/spaces-queries.service'
import { USER_PERMISSION } from '../../users/constants/user'
import { UserModel } from '../../users/models/user.model'
import { FILE_REPOSITORY } from '../constants/operations'
import { FileProps } from '../interfaces/file-props.interface'
import type { FileFavorite, FileFavoriteIdentity, FileFavoriteLocation, FileFavoriteRepository } from '../schemas/file-favorite.interface'
import { getProps, isPathExists } from '../utils/files'
import { FilesFavoritesQueries } from './files-favorites-queries.service'
import { FilesQueries } from './files-queries.service'

const FAVORITE_REPOSITORY_PRIORITY: Record<FileFavoriteRepository, number> = {
  [SPACE_ALIAS.PERSONAL]: 0,
  [FILE_REPOSITORY.SPACE]: 1,
  [FILE_REPOSITORY.SHARE]: 2
}

@Injectable()
export class FilesFavoritesManager {
  constructor(
    private readonly filesQueries: FilesQueries,
    private readonly filesFavoritesQueries: FilesFavoritesQueries,
    private readonly spacesQueries: SpacesQueries,
    private readonly sharesQueries: SharesQueries
  ) {}

  async getFavorites(user: UserModel): Promise<FileFavorite[]> {
    const hasPersonal = user.havePermission(USER_PERMISSION.PERSONAL_SPACE)
    const hasSpaces = user.havePermission(USER_PERMISSION.SPACES)
    const hasShares = user.havePermission(USER_PERMISSION.SHARES)
    const [favorites, spaces, shares] = await Promise.all([
      this.filesFavoritesQueries.getFavoritesFromUser(user.id, hasPersonal, user.isUser),
      hasSpaces ? this.spacesQueries.spaceIdentities(user.id) : Promise.resolve([]),
      hasShares ? this.sharesQueries.shareIdentities(user.id, +user.isAdmin) : Promise.resolve([])
    ])
    if (!favorites.length) {
      return []
    }
    if (!favorites.some(({ isDisabled }) => isDisabled)) {
      return favorites
    }
    const [spaceLocations, shareLocations] = await Promise.all([
      spaces.length
        ? this.filesFavoritesQueries.getFavoriteLocationsFromSpaces(
            user.id,
            spaces.map(({ id }) => id)
          )
        : Promise.resolve([]),
      shares.length
        ? this.filesFavoritesQueries.getFavoriteLocationsFromShares(
            user.id,
            shares.map(({ id }) => id)
          )
        : Promise.resolve([])
    ])
    const locations = [...spaceLocations, ...shareLocations].sort(
      (a, b) =>
        FAVORITE_REPOSITORY_PRIORITY[a.repository] - FAVORITE_REPOSITORY_PRIORITY[b.repository] || a.contextId - b.contextId || a.rootId - b.rootId
    )
    const locationsByFileId = new Map<number, FileFavoriteLocation>()
    for (const location of locations) {
      if (!locationsByFileId.has(location.fileId)) {
        locationsByFileId.set(location.fileId, location)
      }
    }
    return favorites.map((favorite) => {
      if (!favorite.isDisabled) {
        return favorite
      }
      const location = locationsByFileId.get(favorite.fileId)
      if (!location) {
        return favorite
      }
      return {
        ...favorite,
        repository: location.repository,
        path: location.path,
        name: location.name,
        displayRootName: location.displayRootName,
        isDisabled: false
      }
    })
  }

  async addFavorite(user: UserModel, space: SpaceEnv, fileId: number): Promise<FileFavoriteIdentity> {
    this.checkSupportedTarget(space)
    if (!(await isPathExists(space.realPath))) {
      throw new HttpException('Location not found', HttpStatus.NOT_FOUND)
    }
    const fileProps: FileProps = { ...(await getProps(space.realPath, space.dbFile.path)), id: undefined }
    const resolvedFileId = await this.filesQueries.getOrCreateSpaceFile(fileId, fileProps, space.dbFile, { rejectIdMismatch: true })
    await this.filesFavoritesQueries.addFavorite(user.id, resolvedFileId)
    return { fileId: resolvedFileId }
  }

  removeFavorite(user: UserModel, fileId: number): Promise<void> {
    return this.filesFavoritesQueries.removeFavorite(user.id, fileId)
  }

  private checkSupportedTarget(space: SpaceEnv): void {
    if (space.inTrashRepository) {
      throw new HttpException('The trash is read-only', HttpStatus.FORBIDDEN)
    }
    // Virtual external roots have no persisted file row and therefore no stable id to favorite.
    if ((space.dbFile.spaceExternalRootId || space.dbFile.shareExternalId) && space.dbFile.path === '.') {
      throw new HttpException('Not supported on this kind of location', HttpStatus.BAD_REQUEST)
    }
  }
}
