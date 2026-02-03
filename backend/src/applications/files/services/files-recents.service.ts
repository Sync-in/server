import { Injectable } from '@nestjs/common'
import { convertDiffUpdate, convertHumanTimeToMs, diffCollection } from '../../../common/functions'
import { currentTimeStamp } from '../../../common/shared'
import { SharesQueries } from '../../shares/services/shares-queries.service'
import { SpaceEnv } from '../../spaces/models/space-env.model'
import { SpacesQueries } from '../../spaces/services/spaces-queries.service'
import { UserModel } from '../../users/models/user.model'
import { FileProps } from '../interfaces/file-props.interface'
import { FileRecentLocation } from '../interfaces/file-recent-location.interface'
import { FileRecent } from '../schemas/file-recent.interface'
import { FilesQueries } from './files-queries.service'

@Injectable()
export class FilesRecents {
  private readonly keepTime = '14d'

  constructor(
    private readonly filesQueries: FilesQueries,
    private readonly spacesQueries: SpacesQueries,
    private readonly sharesQueries: SharesQueries
  ) {}

  async getRecents(user: UserModel, limit: number): Promise<FileRecent[]> {
    const [spaceIds, shareIds] = await Promise.all([this.spacesQueries.spaceIds(user.id), this.sharesQueries.shareIds(user.id, +user.isAdmin)])
    return this.filesQueries.getRecentsFromUser(user.id, spaceIds, shareIds, limit)
  }

  async updateRecents(user: UserModel, space: SpaceEnv, files: FileProps[]): Promise<void> {
    if (space.inTrashRepository) {
      // Ignore trashed files
      return
    }
    const timestamp = currentTimeStamp(null, true) - convertHumanTimeToMs(this.keepTime)
    const location = this.getLocation(user, space, files)
    // only store files, ignore dirs
    const fsRecents = files.filter((f) => !f.isDir && f.size > 0 && f.mtime > timestamp)
    const dbRecents = await this.filesQueries.getRecentsFromLocation(location)
    if (!fsRecents.length && !dbRecents.length) {
      return
    }
    const [add, update, remove] = diffCollection(dbRecents as any, fsRecents as any, ['mtime', 'name'])
    const toAdd: Partial<FileRecent>[] = add.map(
      (f: FileProps): Partial<FileRecent> =>
        ({
          id: f.id,
          name: f.name,
          mtime: f.mtime,
          mime: f.mime,
          ...location,
          ...(space.inSharesList && { shareId: f.root.id })
        }) as FileRecent
    )
    const toUpdate: Record<string | 'object', Partial<FileProps> | FileProps>[] = convertDiffUpdate(update)
    const toRemove: number[] = remove.map((f: FileRecent) => f.id)
    await this.filesQueries.updateRecents(location, toAdd, toUpdate, toRemove)
  }

  private getLocation(user: UserModel, space: SpaceEnv, files: FileProps[]): FileRecentLocation {
    const location: FileRecentLocation = { path: space.url }
    if (space.inPersonalSpace) {
      location.ownerId = user.id
    } else if (space.inSharesList) {
      location.shareId = files.map((f) => f.root.id)
    } else if (space.inSharesRepository) {
      location.shareId = space.id
    } else {
      location.spaceId = space.id
    }
    return location
  }
}
