/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { ContextManager } from '../../../infrastructure/context/services/context-manager.service'
import type { FileProps } from '../../files/interfaces/file-props.interface'
import { FilesQueries } from '../../files/services/files-queries.service'
import { dirName, fileName, getProps, isPathExists } from '../../files/utils/files'
import { NOTIFICATION_APP, NOTIFICATION_APP_EVENT } from '../../notifications/constants/notifications'
import { NotificationContent } from '../../notifications/interfaces/notification-properties.interface'
import { UserMailNotification } from '../../notifications/interfaces/user-mail-notification.interface'
import { NotificationsManager } from '../../notifications/services/notifications-manager.service'
import { SpaceEnv } from '../../spaces/models/space-env.model'
import { UserModel } from '../../users/models/user.model'
import { CreateOrUpdateCommentDto, DeleteCommentDto } from '../dto/comment.dto'
import { CommentRecent } from '../interfaces/comment-recent.interface'
import type { Comment } from '../schemas/comment.interface'
import { CommentsQueries } from './comments-queries.service'

@Injectable()
export class CommentsManager {
  private readonly logger = new Logger(CommentsManager.name)

  constructor(
    private readonly contextManager: ContextManager,
    private readonly commentQueries: CommentsQueries,
    private readonly filesQueries: FilesQueries,
    private readonly notificationsManager: NotificationsManager
  ) {}

  async getComments(user: UserModel, space: SpaceEnv): Promise<Comment[]> {
    const fileId: number = await this.getFileId(space)
    if (!fileId) {
      return []
    }
    return this.commentQueries.getComments(user.id, space.dbFile?.ownerId === user.id, fileId)
  }

  async createComment(user: UserModel, space: SpaceEnv, createCommentDto: CreateOrUpdateCommentDto): Promise<Comment> {
    if ((space.dbFile.spaceExternalRootId || space.dbFile.shareExternalId) && space.dbFile.path === '.') {
      // If path is empty a file with path = '.' and name = '.' will be created
      // The space browser does not support this kind of file and will remove it
      // Maybe to implement later
      throw new HttpException(`Not supported on this kind of ${space.dbFile.spaceExternalRootId ? 'space root' : 'share'}`, HttpStatus.BAD_REQUEST)
    }
    let fileId: number
    if (createCommentDto.fileId > 0) {
      fileId = await this.getFileId(space)
      if (createCommentDto.fileId !== fileId) {
        throw new HttpException('File id mismatch', HttpStatus.BAD_REQUEST)
      }
    } else {
      fileId = await this.getFileId(space, createCommentDto.fileId)
    }
    const commentId: number = await this.commentQueries.createComment(user.id, fileId, createCommentDto.content)
    this.notify(user, fileId, space, createCommentDto.content).catch((e: Error) => this.logger.error(`${this.createComment.name} - ${e}`))
    return (await this.commentQueries.getComments(user.id, space.dbFile?.ownerId === user.id, null, commentId))[0]
  }

  async updateComment(user: UserModel, space: SpaceEnv, updateCommentDto: CreateOrUpdateCommentDto): Promise<Comment> {
    const [comment] = await this.commentQueries.getComments(user.id, space.dbFile?.ownerId === user.id, null, updateCommentDto.commentId)
    if (!comment) {
      throw new HttpException('Location not found', HttpStatus.NOT_FOUND)
    }
    const fileId: number = await this.getFileId(space)
    if (updateCommentDto.fileId !== fileId || comment.fileId !== fileId) {
      throw new HttpException('File id mismatch', HttpStatus.BAD_REQUEST)
    }
    if (!(await this.commentQueries.updateComment(user.id, updateCommentDto.commentId, updateCommentDto.fileId, updateCommentDto.content))) {
      throw new HttpException('Unable to update', HttpStatus.INTERNAL_SERVER_ERROR)
    }
    return (await this.commentQueries.getComments(user.id, space.dbFile?.ownerId === user.id, null, updateCommentDto.commentId))[0]
  }

  async deleteComment(user: UserModel, space: SpaceEnv, deleteCommentDto: DeleteCommentDto): Promise<void> {
    const fileId: number = await this.getFileId(space)
    if (deleteCommentDto.fileId !== fileId) {
      throw new HttpException('File id mismatch', HttpStatus.BAD_REQUEST)
    }
    if (!(await this.commentQueries.deleteComment(user.id, deleteCommentDto.commentId, fileId, space.dbFile?.ownerId === user.id))) {
      throw new HttpException('You are not allowed to do this action', HttpStatus.FORBIDDEN)
    }
  }

  private async getFileId(space: SpaceEnv, fileId?: number): Promise<number> {
    if (!(await isPathExists(space.realPath))) {
      throw new HttpException('Location not found', HttpStatus.NOT_FOUND)
    }
    const fileProps: FileProps = { ...(await getProps(space.realPath, space.dbFile.path)), id: undefined }
    if (fileId) {
      // get or create
      return this.filesQueries.getOrCreateSpaceFile(fileId, fileProps, space.dbFile)
    } else {
      // get only
      return this.filesQueries.getSpaceFileId(fileProps, space.dbFile)
    }
  }

  async getRecents(user: UserModel, limit: number): Promise<CommentRecent[]> {
    return this.commentQueries.getRecentsFromUser(user, limit)
  }

  private async notify(fromUser: UserModel, fileId: number, space: SpaceEnv, comment: string): Promise<void> {
    const members: UserMailNotification[] = await this.commentQueries.membersToNotify(fromUser.id, fileId)
    if (!members.length) {
      return
    }
    const notification: NotificationContent = {
      app: NOTIFICATION_APP.COMMENTS,
      event: NOTIFICATION_APP_EVENT.COMMENTS,
      element: fileName(space.url),
      url: dirName(space.url)
    }
    this.notificationsManager
      .create(members, notification, {
        author: fromUser,
        currentUrl: this.contextManager.headerOriginUrl(),
        content: comment
      })
      .catch((e: Error) => this.logger.error(`${this.notify.name} - ${e}`))
  }
}
