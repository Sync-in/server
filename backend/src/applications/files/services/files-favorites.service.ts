import { Injectable } from '@nestjs/common'
import type { FileProps } from '../interfaces/file-props.interface'
import { UserModel } from '../../users/models/user.model'
import { FilesQueries } from './files-queries.service'

@Injectable()
export class FilesFavorites {
  constructor(private readonly filesQueries: FilesQueries) {}

  getFavorites(user: UserModel, limit?: number): Promise<FileProps[]> {
    return this.filesQueries.getFavorites(user.id, limit)
  }

  addFavorite(user: UserModel, fileId: number): Promise<void> {
    return this.filesQueries.addFavorite(user.id, fileId)
  }

  removeFavorite(user: UserModel, fileId: number): Promise<void> {
    return this.filesQueries.removeFavorite(user.id, fileId)
  }
}
