import { Injectable, NotFoundException } from '@nestjs/common'
import type { FileFavorite } from '../schemas/file-favorite.interface'
import { UserModel } from '../../users/models/user.model'
import { FilesQueries } from './files-queries.service'

@Injectable()
export class FilesFavorites {
  constructor(private readonly filesQueries: FilesQueries) {}

  getFavorites(user: UserModel, limit?: number): Promise<FileFavorite[]> {
    return this.filesQueries.getFavorites(user.id, Math.min(limit ?? 100, 1000))
  }

  async addFavorite(user: UserModel, fileId: number): Promise<void> {
    // TODO: extend to cover space/share membership once a general "can user access file" helper exists
    const accessible = await this.filesQueries.isFileAccessibleByUser(user.id, fileId)
    if (!accessible) {
      throw new NotFoundException()
    }
    return this.filesQueries.addFavorite(user.id, fileId)
  }

  removeFavorite(user: UserModel, fileId: number): Promise<void> {
    return this.filesQueries.removeFavorite(user.id, fileId)
  }
}
