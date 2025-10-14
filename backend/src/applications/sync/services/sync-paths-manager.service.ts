/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { ACTION } from '../../../common/constants'
import { currentTimeStamp } from '../../../common/shared'
import { ContextManager } from '../../../infrastructure/context/services/context-manager.service'
import type { FileProps } from '../../files/interfaces/file-props.interface'
import { FilesQueries } from '../../files/services/files-queries.service'
import { getProps, isPathExists, isPathIsDir } from '../../files/utils/files'
import { NOTIFICATION_APP, NOTIFICATION_APP_EVENT } from '../../notifications/constants/notifications'
import { NotificationContent } from '../../notifications/interfaces/notification-properties.interface'
import { NotificationsManager } from '../../notifications/services/notifications-manager.service'
import { FastifySpaceRequest } from '../../spaces/interfaces/space-request.interface'
import { SpaceEnv } from '../../spaces/models/space-env.model'
import { SpacesManager } from '../../spaces/services/spaces-manager.service'
import { getEnvPermissions } from '../../spaces/utils/permissions'
import { UserModel } from '../../users/models/user.model'
import { SYNC_PATH_REPOSITORY } from '../constants/sync'
import { SyncPathDto, SyncPathUpdateDto } from '../dtos/sync-path.dto'
import { SyncDBProps, SyncPathSettings } from '../interfaces/sync-path.interface'
import { SyncClient } from '../schemas/sync-client.interface'
import { SYNC_PATH_TO_SPACE_SEGMENTS } from '../utils/routes'
import { SyncQueries } from './sync-queries.service'

@Injectable()
export class SyncPathsManager {
  private readonly logger = new Logger(SyncPathsManager.name)

  constructor(
    private readonly contextManager: ContextManager,
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
      throw new HttpException('Storage quota exceeded', HttpStatus.INSUFFICIENT_STORAGE)
    }
    if (!(await isPathExists(req.space.realPath))) {
      throw new HttpException(`Remote path not found : ${syncPathDto.remotePath}`, HttpStatus.NOT_FOUND)
    }
    if (!(await isPathIsDir(req.space.realPath))) {
      throw new HttpException('Remote path must be a directory', HttpStatus.BAD_REQUEST)
    }
    const client: SyncClient = await this.syncQueries.getClient(req.user.clientId, req.user.id)
    if (!client) {
      throw new HttpException('Client not found', HttpStatus.NOT_FOUND)
    }
    const syncDBProps: SyncDBProps = await this.getDBProps(req.space)

    // important : ensures the right remote path is used and stored
    syncPathDto.remotePath = req.params['*']
    // add permissions (skip end point protection using getEnvPermission)
    syncPathDto.permissions = getEnvPermissions(req.space, req.space.root)
    const pathId = await this.syncQueries.createPath(client.id, syncDBProps, syncPathDto)
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
      this.logger.error(`${this.deletePath.name} - ${e}`)
      throw new HttpException('Unable to remove path', HttpStatus.BAD_REQUEST)
    }
  }

  async updatePath(user: UserModel, clientId: string, pathId: number, syncPathUpdateDto: SyncPathUpdateDto): Promise<SyncPathSettings> {
    if (!(await this.syncQueries.clientExistsForOwner(user.id, clientId))) {
      throw new HttpException('You are not allowed to do this action', HttpStatus.FORBIDDEN)
    }
    const syncPathSettings: SyncPathSettings = await this.syncQueries.getPathSettings(clientId, pathId)
    if (!syncPathSettings) {
      throw new HttpException('Sync path not found', HttpStatus.NOT_FOUND)
    }
    // delete possible id
    delete syncPathUpdateDto.id
    // update current path settings
    Object.assign(syncPathSettings, syncPathUpdateDto)
    syncPathSettings.timestamp = currentTimeStamp()
    try {
      await this.syncQueries.updatePathSettings(clientId, pathId, syncPathSettings)
    } catch (e) {
      this.logger.error(`${this.updatePath.name} - ${e}`)
      throw new HttpException('Unable to update path', HttpStatus.INTERNAL_SERVER_ERROR)
    } finally {
      // clear cache
      this.syncQueries.clearCachePathSettings(clientId, pathId)
    }
    return syncPathSettings
  }

  async updatePaths(
    user: UserModel,
    syncPathsDto: SyncPathDto[]
  ): Promise<{
    add: SyncPathSettings[]
    update: Partial<Record<keyof SyncPathSettings, any>>[]
    delete: number[]
  }> {
    /* Update the client or server paths */
    if (!user.clientId) {
      throw new HttpException('Client id is missing', HttpStatus.BAD_REQUEST)
    }
    if (!(await this.syncQueries.clientExistsForOwner(user.id, user.clientId))) {
      throw new HttpException('You are not allowed to do this action', HttpStatus.FORBIDDEN)
    }
    const clientPathIds: number[] = syncPathsDto.map((p) => p.id)
    const serverPathIds: number[] = []

    const clientDiff: { add: SyncPathSettings[]; update: Partial<Record<keyof SyncPathSettings, any>>[]; delete: number[] } = {
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
      let space: SpaceEnv
      try {
        space = await this.spacesManager.spaceEnv(user, SYNC_PATH_TO_SPACE_SEGMENTS(serverPath.remotePath), true)
      } catch (e) {
        throw new HttpException(e.message, HttpStatus.BAD_REQUEST)
      }
      if (!space) {
        // removed or inaccessible space, the path will be stored as deleted
        continue
      }
      serverPathIds.push(serverPath.id)
      if (clientPathIds.indexOf(serverPath.id) === -1) {
        // path exists on server but not on client, add it to client
        clientDiff.add.push({ ...serverPath.settings, id: serverPath.id, remotePath: serverPath.remotePath, permissions: space.envPermissions })
        continue
      }

      // path exists on both server and client side
      const clientPath: SyncPathDto = syncPathsDto.find((p) => p.id === serverPath.id)
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
        updatedSettings = { ...clientPath, ...updateClientInfo }
      } else if (serverNewer) {
        clientDiff.update.push({ id: clientPath.id, ...serverPath.settings, ...updateClientInfo })
      }

      if (clientNewer || hasUpdates || serverPath.settings.lastSync !== clientPath.lastSync) {
        this.syncQueries
          .updatePathSettings(user.clientId, clientPath.id, { ...updatedSettings, lastSync: clientPath.lastSync })
          .catch((e: Error) => this.logger.error(`${this.updatePaths.name} - ${e}`))
      }

      if (!clientNewer && hasUpdates) {
        clientDiff.update.push({ id: clientPath.id, ...updateClientInfo })
      }
    }
    // path does not exist on server side
    clientDiff.delete = clientPathIds.filter((cid) => serverPathIds.indexOf(cid) === -1)
    for (const cPathId of clientDiff.delete) {
      const cPath: SyncPathDto = syncPathsDto.find((p) => p.id === cPathId)
      this.notify(user.id, ACTION.DELETE, cPath.remotePath).catch((e: Error) => this.logger.error(`${this.updatePaths.name} - ${e}`))
    }
    // clear cache
    clientDiff.update.forEach((path) => this.syncQueries.clearCachePathSettings(user.clientId, path.id))
    return clientDiff
  }

  private async getDBProps(space: SpaceEnv): Promise<SyncDBProps> {
    if (space.inSharesList) {
      throw new HttpException('Sync all shares is not supported, you must select a sub-directory', HttpStatus.BAD_REQUEST)
    } else if (space.inPersonalSpace) {
      if (space.paths.length) {
        return { ownerId: space.dbFile.ownerId, fileId: await this.getOrCreateFileId(space) }
      } else {
        return { ownerId: space.dbFile.ownerId }
      }
    } else if (space.inFilesRepository) {
      if (!space?.root?.alias) {
        // The synchronization direction should be adapted for each root depending on the permissions, this is not yet supported
        throw new HttpException('Sync all space is not yet supported, you must select a sub-directory', HttpStatus.BAD_REQUEST)
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
    let fileId: number = await this.filesQueries.getSpaceFileId(fileProps, space.dbFile)
    if (!fileId) {
      fileId = await this.filesQueries.getOrCreateSpaceFile(fileId, { ...fileProps, id: undefined }, space.dbFile)
    }
    return fileId
  }

  private async notify(userId: number, action: ACTION, remotePath: string) {
    const notification: NotificationContent = {
      app: NOTIFICATION_APP.SYNC,
      event: NOTIFICATION_APP_EVENT.SYNC[action],
      element: remotePath,
      url: [...SYNC_PATH_REPOSITORY[remotePath.split('/').at(0)], ...remotePath.split('/').slice(1, -1)].join('/')
    }
    this.notificationsManager
      .create([userId], notification, {
        currentUrl: this.contextManager.get('headerOriginUrl'),
        action: action
      })
      .catch((e: Error) => this.logger.error(`${this.notify.name} - ${e}`))
  }
}
