import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { ACTION } from '../../../common/constants.js'
import { toErrorMessage } from '../../../common/errors.js'
import { currentTimeStamp } from '../../../common/shared.js'
import { FILE_ERROR } from '../../files/constants/errors.js'
import type { FileProps } from '../../files/interfaces/file-props.interface.js'
import { FilesQueries } from '../../files/services/files-queries.service.js'
import { getProps, isPathExists, isPathIsDir } from '../../files/utils/files.js'
import { NOTIFICATION_APP, NOTIFICATION_APP_EVENT } from '../../notifications/constants/notifications.js'
import { NotificationContent } from '../../notifications/interfaces/notification-properties.interface.js'
import { NotificationsManager } from '../../notifications/services/notifications-manager.service.js'
import { FastifySpaceRequest } from '../../spaces/interfaces/space-request.interface.js'
import { SpaceEnv } from '../../spaces/models/space-env.model.js'
import { SpacesManager } from '../../spaces/services/spaces-manager.service.js'
import { getEnvPermissions } from '../../spaces/utils/permissions.js'
import { UserModel } from '../../users/models/user.model.js'
import { SYNC_PATH_REPOSITORY } from '../constants/sync.js'
import type { SyncPathDto, SyncPathUpdateDto } from '../dtos/sync-path.dto.js'
import { ExistingSyncPathDto, SyncDBProps, SyncPathsDiff, SyncPathSettings } from '../interfaces/sync-path.interface.js'
import { SYNC_PATH_TO_SPACE_SEGMENTS } from '../utils/routes.js'
import { SyncQueries } from './sync-queries.service.js'

@Injectable()
export class SyncPathsManager {
  private readonly logger = new Logger(SyncPathsManager.name)

  constructor(
    private readonly spacesManager: SpacesManager,
    private readonly filesQueries: FilesQueries,
    private readonly syncQueries: SyncQueries,
    private readonly notificationsManager: NotificationsManager
  ) {}

  async createPath(req: FastifySpaceRequest, syncPathDto: SyncPathDto): Promise<{ id: number; permissions: string }> {
    if (!req.user.clientId) {
      throw new HttpException('Client id is missing', HttpStatus.BAD_REQUEST)
    }
    if (req.space.quotaIsExceeded) {
      throw new HttpException(FILE_ERROR.STORAGE_QUOTA_EXCEEDED, HttpStatus.INSUFFICIENT_STORAGE)
    }

    // Check DB path
    const syncDBProps: SyncDBProps = (await this.getDBProps(req.space))!

    if (!(await isPathExists(req.space.realPath))) {
      throw new HttpException(`Remote path not found : ${syncPathDto.remotePath}`, HttpStatus.NOT_FOUND)
    }
    if (!(await isPathIsDir(req.space.realPath))) {
      throw new HttpException('Remote path must be a directory', HttpStatus.BAD_REQUEST)
    }
    const client = await this.syncQueries.getClient(req.user.clientId, req.user.id)
    if (!client) {
      throw new HttpException('Client not found', HttpStatus.NOT_FOUND)
    }

    // important: ensures the right remote path is used and stored
    syncPathDto.remotePath = req.params['*']
    // add permissions (skip end point protection using getEnvPermission)
    syncPathDto.permissions = getEnvPermissions(req.space, req.space.root)
    // Backward compatibility: clients predating this setting omit it.
    syncPathDto.ignoreDelete = syncPathDto.ignoreDelete === true
    const syncPathSettings = { ...syncPathDto, id: syncPathDto.id ?? undefined } satisfies SyncPathSettings
    const pathId = await this.syncQueries.createPath(client.id, syncDBProps, syncPathSettings)
    return { id: pathId, permissions: syncPathDto.permissions }
  }

  async deletePath(user: UserModel, pathId: number, clientId?: string): Promise<void> {
    clientId = user.clientId || clientId
    if (!clientId) {
      throw new HttpException('Client id is missing', HttpStatus.BAD_REQUEST)
    }
    if (!(await this.syncQueries.clientExistsForOwner(user.id, clientId))) {
      throw new HttpException('You are not allowed to do this action', HttpStatus.FORBIDDEN)
    }
    try {
      await this.syncQueries.deletePath(clientId, pathId)
    } catch (e) {
      this.logger.error({ tag: this.deletePath.name, msg: toErrorMessage(e) })
      throw new HttpException('Unable to remove path', HttpStatus.BAD_REQUEST)
    }
  }

  async updatePath(user: UserModel, clientId: string, pathId: number, syncPathUpdateDto: SyncPathUpdateDto): Promise<SyncPathSettings> {
    if (!(await this.syncQueries.clientExistsForOwner(user.id, clientId))) {
      throw new HttpException('You are not allowed to do this action', HttpStatus.FORBIDDEN)
    }
    const syncPathSettings = await this.syncQueries.getPathSettings(clientId, pathId)
    if (!syncPathSettings) {
      throw new HttpException('Sync path not found', HttpStatus.NOT_FOUND)
    }
    // delete possible id
    delete syncPathUpdateDto.id
    // update current path settings
    const currentIgnoreDelete = syncPathSettings.ignoreDelete
    Object.assign(syncPathSettings, syncPathUpdateDto)
    // Partial updates from older clients must not reset an already enabled value.
    if (syncPathUpdateDto.ignoreDelete === undefined) {
      syncPathSettings.ignoreDelete = currentIgnoreDelete
    }
    syncPathSettings.timestamp = currentTimeStamp()
    try {
      await this.syncQueries.updatePathSettings(clientId, pathId, syncPathSettings)
    } catch (e) {
      this.logger.error({ tag: this.updatePath.name, msg: toErrorMessage(e) })
      throw new HttpException('Unable to update path', HttpStatus.INTERNAL_SERVER_ERROR)
    } finally {
      // clear cache
      this.syncQueries.clearCachePathSettings(clientId, pathId)
    }
    return syncPathSettings
  }

  async updatePaths(user: UserModel, syncPathsDto: ExistingSyncPathDto[]): Promise<SyncPathsDiff> {
    /* Update the client or server paths */
    if (!user.clientId) {
      throw new HttpException('Client id is missing', HttpStatus.BAD_REQUEST)
    }
    if (!(await this.syncQueries.clientExistsForOwner(user.id, user.clientId))) {
      throw new HttpException('You are not allowed to do this action', HttpStatus.FORBIDDEN)
    }
    const clientPathIds: number[] = syncPathsDto.map((p) => p.id)
    const clientPathsById = new Map<number, ExistingSyncPathDto>()
    for (const clientPath of syncPathsDto) {
      if (!clientPathsById.has(clientPath.id)) {
        clientPathsById.set(clientPath.id, clientPath)
      }
    }
    const serverPathIds = new Set<number>()

    const clientDiff: SyncPathsDiff = {
      add: [],
      update: [],
      delete: []
    }
    const serverPaths: { id: number; settings: SyncPathSettings; remotePath: string }[] = await this.syncQueries.getPaths(user.clientId)
    for (const serverPath of serverPaths) {
      if (!serverPath.remotePath) {
        // unable to determine path, will be stored as deleted
        continue
      }
      let space: SpaceEnv | null
      try {
        space = await this.spacesManager.spaceEnv(user, SYNC_PATH_TO_SPACE_SEGMENTS(serverPath.remotePath), true)
      } catch (e) {
        throw new HttpException(toErrorMessage(e), HttpStatus.BAD_REQUEST)
      }
      if (!space) {
        // removed or inaccessible space, the path will be stored as deleted
        continue
      }
      serverPathIds.add(serverPath.id)
      const clientPath = clientPathsById.get(serverPath.id)
      if (!clientPath) {
        // path exists on server but not on client, add it to client
        clientDiff.add.push({ ...serverPath.settings, id: serverPath.id, remotePath: serverPath.remotePath, permissions: space.envPermissions })
        continue
      }

      // path exists on both server and client side
      // remotePath and permissions settings are only managed by server
      const updateClientInfo: { remotePath?: string; permissions?: string } = {
        ...(serverPath.remotePath !== clientPath.remotePath && { remotePath: serverPath.remotePath }),
        ...(space.envPermissions !== clientPath.permissions && { permissions: space.envPermissions })
      }
      const clientNewer = clientPath.timestamp > serverPath.settings.timestamp
      const serverNewer = clientPath.timestamp < serverPath.settings.timestamp
      const hasUpdates = Object.keys(updateClientInfo).length > 0

      let updatedSettings: SyncPathSettings = { ...serverPath.settings, ...updateClientInfo }

      if (clientNewer) {
        // A legacy client does not send ignoreDelete. Preserve the server value
        // in that case, while still accepting an explicit false from newer clients.
        updatedSettings = {
          ...clientPath,
          ignoreDelete: clientPath.ignoreDelete ?? serverPath.settings.ignoreDelete ?? false,
          ...updateClientInfo
        }
      } else if (serverNewer) {
        clientDiff.update.push({ ...serverPath.settings, ...updateClientInfo, id: clientPath.id })
      }

      if (clientNewer || hasUpdates || serverPath.settings.lastSync !== clientPath.lastSync) {
        this.syncQueries
          .updatePathSettings(user.clientId, clientPath.id, { ...updatedSettings, lastSync: clientPath.lastSync })
          .catch((e: Error) => this.logger.error({ tag: this.updatePaths.name, msg: toErrorMessage(e) }))
      }

      if (!clientNewer && hasUpdates) {
        clientDiff.update.push({ id: clientPath.id, ...updateClientInfo })
      }
    }
    // path does not exist on server side
    clientDiff.delete = clientPathIds.filter((cid) => !serverPathIds.has(cid))
    for (const cPathId of clientDiff.delete) {
      const cPath = clientPathsById.get(cPathId)!
      this.notify(user.id, ACTION.DELETE, cPath.remotePath).catch((e: Error) =>
        this.logger.error({ tag: this.updatePaths.name, msg: toErrorMessage(e) })
      )
    }
    // clear cache
    for (const path of clientDiff.update) {
      this.syncQueries.clearCachePathSettings(user.clientId, path.id)
    }
    return clientDiff
  }

  private async getDBProps(space: SpaceEnv): Promise<SyncDBProps | undefined> {
    if (space.inSharesList) {
      throw new HttpException('Syncing all shares is not supported. Please select a subdirectory', HttpStatus.BAD_REQUEST)
    } else if (space.inPersonalSpace) {
      if (space.paths.length) {
        return { ownerId: space.dbFile.ownerId, fileId: await this.getOrCreateFileId(space) }
      } else {
        throw new HttpException('Syncing all personal files is not supported. Please select a subdirectory', HttpStatus.BAD_REQUEST)
      }
    } else if (space.inFilesRepository) {
      if (!space?.root?.alias) {
        // The synchronization direction should be adapted for each root depending on the permissions, this is not yet supported
        throw new HttpException('Syncing the entire space is not yet supported. Please select a subdirectory', HttpStatus.BAD_REQUEST)
      }
      if (space.root.id && !space.paths.length) {
        return { spaceId: space.id, spaceRootId: space.root.id }
      } else {
        return { spaceId: space.id, spaceRootId: space?.root?.id || null, fileId: await this.getOrCreateFileId(space) }
      }
    } else if (space.inSharesRepository) {
      if (space.paths.length) {
        return { shareId: space.id, fileId: await this.getOrCreateFileId(space) }
      } else {
        return { shareId: space.id }
      }
    }
  }

  private async getOrCreateFileId(space: SpaceEnv): Promise<number> {
    const fileProps: FileProps = await getProps(space.realPath, space.dbFile.path)
    return this.filesQueries.getOrCreateSpaceFile(fileProps.id!, { ...fileProps, id: undefined }, space.dbFile)
  }

  private async notify(userId: number, action: ACTION.DELETE, remotePath: string) {
    const notification: NotificationContent = {
      app: NOTIFICATION_APP.SYNC,
      event: NOTIFICATION_APP_EVENT.SYNC[action],
      element: remotePath,
      url: [...SYNC_PATH_REPOSITORY[remotePath.split('/').at(0) as keyof typeof SYNC_PATH_REPOSITORY], ...remotePath.split('/').slice(1, -1)].join(
        '/'
      )
    }
    this.notificationsManager
      .create([userId], notification, {
        action: action
      })
      .catch((e: Error) => this.logger.error({ tag: this.notify.name, msg: toErrorMessage(e) }))
  }
}
