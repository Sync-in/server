import { Injectable } from '@nestjs/common'
import type { FileFavorite } from '../schemas/file-favorite.interface'
import { UserModel } from '../../users/models/user.model'
import { FavoriteFileDto } from '../dto/favorite-file.dto'
import { FilesQueries } from './files-queries.service'

@Injectable()
export class FilesFavorites {
  constructor(private readonly filesQueries: FilesQueries) {}

  getFavorites(user: UserModel, limit?: number): Promise<FileFavorite[]> {
    return this.filesQueries.getFavorites(user.id, Math.min(limit ?? 100, 1000))
  }

  async addFavorite(user: UserModel, dto: FavoriteFileDto): Promise<{ id: number }> {
    const id = await this.filesQueries.getOrCreateFileForFavorite(user.id, dto)
    await this.filesQueries.addFavorite(user.id, id)
    return { id }
  }

  removeFavorite(user: UserModel, fileId: number): Promise<void> {
    return this.filesQueries.removeFavorite(user.id, fileId)
  }
}
