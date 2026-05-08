import { Injectable } from '@nestjs/common'
import type { FileFavorite } from '../schemas/file-favorite.interface'
import { SharesQueries } from '../../shares/services/shares-queries.service'
import { SpacesQueries } from '../../spaces/services/spaces-queries.service'
import { UserModel } from '../../users/models/user.model'
import { FavoriteFileDto } from '../dto/favorite-file.dto'
import { FilesQueries } from './files-queries.service'

@Injectable()
export class FilesFavorites {
  constructor(
    private readonly filesQueries: FilesQueries,
    private readonly spacesQueries: SpacesQueries,
    private readonly sharesQueries: SharesQueries
  ) {}

  async getFavorites(user: UserModel, limit?: number): Promise<FileFavorite[]> {
    const [spaceIds, shareIds] = await Promise.all([this.spacesQueries.spaceIds(user.id), this.sharesQueries.shareIds(user.id, +user.isAdmin)])
    return this.filesQueries.getFavorites(user.id, spaceIds, shareIds, Math.min(limit ?? 100, 1000))
  }

  async addFavorite(user: UserModel, dto: FavoriteFileDto): Promise<FileFavorite> {
    const id = await this.filesQueries.getOrCreateFileForFavorite(user.id, dto)
    await this.filesQueries.addFavorite(user.id, id)
    return this.filesQueries.getFavoriteForFile(user.id, id)
  }

  removeFavorite(user: UserModel, fileId: number): Promise<void> {
    return this.filesQueries.removeFavorite(user.id, fileId)
  }
}
