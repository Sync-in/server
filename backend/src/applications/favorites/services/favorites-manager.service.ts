import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import type { FileProps } from '../../files/interfaces/file-props.interface'
import { FilesFavorites } from '../../files/services/files-favorites.service'
import { FilesQueries } from '../../files/services/files-queries.service'
import { getProps, isPathExists } from '../../files/utils/files'
import type { FileFavorite } from '../../files/schemas/file-favorite.interface'
import { SpaceEnv } from '../../spaces/models/space-env.model'
import { UserModel } from '../../users/models/user.model'

@Injectable()
export class FavoritesManager {
  private readonly logger = new Logger(FavoritesManager.name)

  constructor(
    private readonly filesFavorites: FilesFavorites,
    private readonly filesQueries: FilesQueries
  ) {}

  getFavorites(user: UserModel, limit?: number): Promise<FileFavorite[]> {
    return this.filesFavorites.getFavorites(user, limit)
  }

  async addFavorite(user: UserModel, space: SpaceEnv): Promise<FileFavorite> {
    const fileId = await this.getOrCreateFileId(space)
    return this.filesFavorites.addFavoriteById(user.id, fileId)
  }

  async removeFavorite(user: UserModel, space: SpaceEnv): Promise<void> {
    const fileId = await this.getFileId(space)
    if (fileId === undefined) {
      throw new HttpException('Location not found', HttpStatus.NOT_FOUND)
    }
    return this.filesFavorites.removeFavorite(user, fileId)
  }

  private async getOrCreateFileId(space: SpaceEnv): Promise<number> {
    if (!(await isPathExists(space.realPath))) {
      throw new HttpException('Location not found', HttpStatus.NOT_FOUND)
    }
    const fileProps: FileProps = { ...(await getProps(space.realPath, space.dbFile.path)), id: undefined }
    // no client-supplied fileId — pass 0 to skip the fast-path lookup
    return this.filesQueries.getOrCreateSpaceFile(0, fileProps, space.dbFile)
  }

  private async getFileId(space: SpaceEnv): Promise<number | undefined> {
    if (!(await isPathExists(space.realPath))) {
      throw new HttpException('Location not found', HttpStatus.NOT_FOUND)
    }
    const fileProps: FileProps = { ...(await getProps(space.realPath, space.dbFile.path)), id: undefined }
    return this.filesQueries.getSpaceFileId(fileProps, space.dbFile)
  }
}
