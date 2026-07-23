import { Injectable } from '@nestjs/common'
import path from 'node:path'
import { convertHumanTimeToMs } from '../../../common/functions'
import { currentTimeStamp } from '../../../common/shared'
import { SharesQueries } from '../../shares/services/shares-queries.service'
import { SpaceEnv } from '../../spaces/models/space-env.model'
import { SpacesQueries } from '../../spaces/services/spaces-queries.service'
import { USER_PERMISSION } from '../../users/constants/user'
import { UserModel } from '../../users/models/user.model'
import { FileProps } from '../interfaces/file-props.interface'
import type { FileRecent, FileRecentDeletion, FileRecentLocation, FileRecentUpdate } from '../schemas/file-recent.interface'
import { getProps } from '../utils/files'
import { FilesQueries } from './files-queries.service'

@Injectable()
export class FilesRecents {
  private readonly keepTimeMs = convertHumanTimeToMs('14d')

  constructor(
    private readonly filesQueries: FilesQueries,
    private readonly spacesQueries: SpacesQueries,
    private readonly sharesQueries: SharesQueries
  ) {}

  async getRecents(user: UserModel, limit: number): Promise<FileRecent[]> {
    const [spaceIds, shareIds] = await Promise.all([
      user.havePermission(USER_PERMISSION.SPACES) ? this.spacesQueries.spaceIds(user.id) : Promise.resolve([]),
      user.havePermission(USER_PERMISSION.SHARES) ? this.sharesQueries.shareIds(user.id, +user.isAdmin) : Promise.resolve([])
    ])
    const ownerId = user.havePermission(USER_PERMISSION.PERSONAL_SPACE) ? user.id : undefined
    return this.filesQueries.getRecentsFromUser(ownerId, spaceIds, shareIds, limit)
  }

  async updateRecents(user: UserModel, space: SpaceEnv, files: FileProps[]): Promise<void> {
    if (space.inTrashRepository) {
      // Ignore trashed files
      return
    }
    const location = this.getSnapshotLocation(user, space, space.url, files)
    const recents = this.toRecents(space, location, files)
    if (space.inSharesList) {
      // The shares list is a complete snapshot and can expose the same file several times.
      await this.filesQueries.replaceRecents(location, recents)
      return
    }
    await this.updateSnapshot(location, recents)
  }

  async updateRecentFromEditor(user: UserModel, space: SpaceEnv, realPath: string): Promise<void> {
    if (space.inTrashRepository || space.inSharesList) return

    const file = await getProps(realPath, space.dbFile.path)
    if (!this.isRecentFile(file, this.getMinRecentMtime())) return

    // Match the identity produced while browsing: prefer the database id, otherwise keep the negative inode.
    file.id = (await this.filesQueries.getSpaceFileId(file, space.dbFile, { withDir: false })) ?? file.id
    const location: FileRecentLocation = {
      ...this.getRepositoryLocation(user.id, space.id, space.inPersonalSpace, space.inSharesRepository),
      path: path.dirname(space.url)
    }
    await this.filesQueries.upsertRecent(location, {
      id: file.id,
      name: file.name,
      mtime: file.mtime,
      mime: file.mime,
      ...location
    } as FileRecent)
  }

  private toRecents(space: SpaceEnv, location: FileRecentLocation, files: FileProps[]): FileRecent[] {
    const minMtime = this.getMinRecentMtime()
    // FileProps.id is the browser identity: database id when available, otherwise negative inode.
    const recents = new Map<number, FileRecent>()
    for (const file of files) {
      if (!this.isRecentFile(file, minMtime)) continue
      recents.set(file.id, {
        id: file.id,
        name: file.name,
        mtime: file.mtime,
        mime: file.mime,
        ...location,
        ...(space.inSharesList && { shareId: file.root.id })
      } as FileRecent)
    }
    return [...recents.values()]
  }

  private async updateSnapshot(location: FileRecentLocation, fsRecents: FileRecent[]): Promise<void> {
    const dbRecents = await this.filesQueries.getRecentsFromLocation(location)
    if (!fsRecents.length && !dbRecents.length) {
      return
    }
    const dbRecentsById = new Map(dbRecents.map((recent) => [recent.id, recent]))
    const add: FileRecent[] = []
    const update: FileRecentUpdate[] = []
    for (const recent of fsRecents) {
      const dbRecent = dbRecentsById.get(recent.id)
      if (!dbRecent) {
        add.push(recent)
        continue
      }
      const changes: Omit<FileRecentUpdate, 'id'> = {}
      if (recent.name !== dbRecent.name) changes.name = recent.name
      if (recent.mtime !== dbRecent.mtime) changes.mtime = recent.mtime
      if (recent.mime !== dbRecent.mime) changes.mime = recent.mime
      if (Object.keys(changes).length) update.push({ id: recent.id, ...changes })
      dbRecentsById.delete(recent.id)
    }
    const remove = [...dbRecentsById.keys()]
    if (!add.length && !update.length && !remove.length) {
      return
    }
    await this.filesQueries.updateRecents(location, add, update, remove)
  }

  async deleteRecents(deletions: FileRecentDeletion[]): Promise<void> {
    await this.filesQueries.deleteRecents(
      deletions.map(({ userId, spaceId, inPersonalSpace, inSharesRepository, path: sourcePath }) => ({
        ...this.getRepositoryLocation(userId, spaceId, inPersonalSpace, inSharesRepository),
        path: path.normalize(sourcePath)
      }))
    )
  }

  private getMinRecentMtime(): number {
    // get the oldest modification time eligible for recents
    return currentTimeStamp(null, true) - this.keepTimeMs
  }

  private isRecentFile(file: FileProps, minMtime: number): boolean {
    // only keep non-empty files modified within the retention period
    return !file.isDir && file.size > 0 && file.mtime > minMtime
  }

  private getRepositoryLocation(
    userId: number,
    spaceId: number,
    inPersonalSpace: boolean,
    inSharesRepository: boolean
  ): Omit<FileRecentLocation, 'path'> {
    if (inPersonalSpace) {
      return { ownerId: userId }
    }
    if (inSharesRepository) {
      return { shareId: spaceId }
    }
    return { spaceId }
  }

  private getSnapshotLocation(user: UserModel, space: SpaceEnv, logicalPath: string, files: FileProps[]): FileRecentLocation {
    if (space.inSharesList) {
      return { path: logicalPath, shareId: files.map((file) => file.root.id) }
    }
    return { ...this.getRepositoryLocation(user.id, space.id, space.inPersonalSpace, space.inSharesRepository), path: logicalPath }
  }
}
