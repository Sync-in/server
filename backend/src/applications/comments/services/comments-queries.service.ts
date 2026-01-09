/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Inject, Injectable } from '@nestjs/common'
import { and, desc, eq, getTableColumns, inArray, isNotNull, isNull, ne, or, SelectedFields, SQL, sql } from 'drizzle-orm'
import { alias, union } from 'drizzle-orm/mysql-core'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants'
import type { DBSchema } from '../../../infrastructure/database/interfaces/database.interface'
import { dbCheckAffectedRows, dbGetInsertedId } from '../../../infrastructure/database/utils'
import { filePathSQL, files } from '../../files/schemas/files.schema'
import { UserMailNotification } from '../../notifications/interfaces/user-mail-notification.interface'
import { shares } from '../../shares/schemas/shares.schema'
import { SharesQueries } from '../../shares/services/shares-queries.service'
import { SPACE_ALIAS, SPACE_REPOSITORY } from '../../spaces/constants/spaces'
import { spacesRoots } from '../../spaces/schemas/spaces-roots.schema'
import { spaces } from '../../spaces/schemas/spaces.schema'
import { SpacesQueries } from '../../spaces/services/spaces-queries.service'
import { UserModel } from '../../users/models/user.model'
import { userFullNameSQL, users } from '../../users/schemas/users.schema'
import { CommentRecent } from '../interfaces/comment-recent.interface'
import { Comment } from '../schemas/comment.interface'
import { comments } from '../schemas/comments.schema'

@Injectable()
export class CommentsQueries {
  constructor(
    @Inject(DB_TOKEN_PROVIDER) private readonly db: DBSchema,
    private readonly spacesQueries: SpacesQueries,
    private readonly sharesQueries: SharesQueries
  ) {}

  getComments(userId: number, isFileOwner: boolean, fromFileId?: number, fromCommentId?: number, limit: number = undefined): Promise<Comment[]> {
    let where: SQL
    if (fromFileId) {
      where = eq(comments.fileId, fromFileId)
    } else if (fromCommentId) {
      where = eq(comments.id, fromCommentId)
      limit = 1
    } else {
      throw Error('fromFileId or fromCommentId must be provided')
    }
    return this.db
      .select({
        ...getTableColumns(comments),
        author: { login: users.login, fullName: userFullNameSQL(users), email: users.email, isAuthor: sql`${users.id} = ${userId}`.mapWith(Boolean) },
        isFileOwner: sql`${+isFileOwner}`.mapWith(Boolean)
      })
      .from(comments)
      .leftJoin(users, eq(users.id, comments.userId))
      .where(where)
      .orderBy(desc(comments.id))
      .limit(limit)
  }

  async createComment(userId: number, fileId: number, content: string): Promise<Comment['id']> {
    return dbGetInsertedId(await this.db.insert(comments).values({ userId: userId, fileId: fileId, content: content } as Comment))
  }

  async updateComment(userId: number, commentId: number, fileId: number, content: string): Promise<boolean> {
    return dbCheckAffectedRows(
      await this.db
        .update(comments)
        .set({ content: content } as Comment)
        .where(and(eq(comments.userId, userId), eq(comments.id, commentId), eq(comments.fileId, fileId)))
        .limit(1),
      1,
      false
    )
  }

  async deleteComment(userId: number, commentId: number, fileId: number, isFileOwner: boolean): Promise<boolean> {
    return dbCheckAffectedRows(
      await this.db
        .delete(comments)
        .where(and(or(eq(sql`${+isFileOwner}`, 1), eq(comments.userId, userId)), eq(comments.id, commentId), eq(comments.fileId, fileId)))
        .limit(1),
      1,
      false
    )
  }

  membersToNotify(fromUserId: number, fileId: number): Promise<UserMailNotification[]> {
    /* lists the owner of the file and the users who have commented on it */
    const select: UserMailNotification | SelectedFields<any, any> = {
      id: users.id,
      email: users.email,
      language: users.language,
      notification: users.notification
    }
    const fromComments = this.db
      .select(select)
      .from(comments)
      .innerJoin(users, and(eq(users.id, comments.userId), ne(users.id, fromUserId)))
      .where(eq(comments.fileId, fileId))
    const fromFile = this.db
      .select(select)
      .from(files)
      .innerJoin(users, and(eq(users.id, files.ownerId), ne(users.id, fromUserId)))
      .where(eq(files.id, fileId))
    return union(fromComments, fromFile) as any
  }

  getRecentsFromShares(userId: number, shareIds: number[], limit: number) {
    const shareFile: any = alias(files, 'shareFile')
    return this.db
      .select({
        id: comments.id,
        content: comments.content,
        modifiedAt: comments.modifiedAt,
        author: { login: users.login, fullName: userFullNameSQL(users).as('fullName'), email: users.email },
        file: {
          name: sql<string>`IF (${files.id} = ${shareFile.id}, ${shares.name}, ${files.name})`.as('name'),
          path: sql<string>`
          CONCAT_WS('/', '${sql.raw(SPACE_REPOSITORY.SHARES)}',
            IF (${shareFile.id} IS NOT NULL,
              IF (${files.id} = ${shareFile.id}, NULL, REGEXP_REPLACE(${files.path}, ${filePathSQL(shareFile)}, ${shares.alias})),
              CONCAT_WS('/', ${shares.alias}, IF (${files.path} = '.', NULL, ${files.path}))
            )
          )`.as('path'),
          mime: files.mime,
          inTrash: sql<number>`0`.as('inTrash'),
          fromSpace: sql<number>`0`.as('fromSpace'),
          fromShare: sql<number>`1`.as('fromShare')
        }
      } satisfies CommentRecent | SelectedFields<any, any>)
      .from(shares)
      .leftJoin(shareFile, eq(shareFile.id, shares.fileId))
      .leftJoin(spaces, eq(spaces.id, shareFile.spaceId))
      .leftJoin(spacesRoots, eq(spacesRoots.spaceId, spaces.id))
      .leftJoin(
        files,
        or(
          // file linked to the share
          eq(files.id, shareFile.id),
          // all files with an external share id
          and(isNull(shareFile.id), eq(files.shareExternalId, shares.id)),
          // all files under the share
          and(
            isNotNull(shareFile.id),
            eq(shareFile.isDir, true),
            sql`${files.spaceId} <=> ${shareFile.spaceId}`,
            sql`${files.ownerId} <=> ${shareFile.ownerId}`,
            sql`${files.spaceExternalRootId} <=> ${shareFile.spaceExternalRootId}`,
            sql`${files.shareExternalId} <=> ${shareFile.shareExternalId}`,
            sql`${files.path} REGEXP CONCAT('^', IF(${shareFile.path} = '.', CONCAT(${shareFile.name}, '(/.*|)$'), CONCAT(${shareFile.path}, '/')))`
          )
        )
      )
      .innerJoin(comments, and(eq(comments.fileId, files.id), ne(comments.userId, userId)))
      .innerJoin(users, eq(users.id, comments.userId))
      .where(inArray(shares.id, shareIds))
      .groupBy(comments.id)
      .orderBy(desc(comments.id))
      .limit(limit)
  }

  getRecentsFromSpaces(userId: number, spaceIds: number[], limit: number) {
    const spaceRootFile: any = alias(files, 'spaceRootFile')
    return this.db
      .select({
        id: comments.id,
        content: comments.content,
        modifiedAt: comments.modifiedAt,
        author: { login: users.login, fullName: userFullNameSQL(users).as('fullName'), email: users.email },
        file: {
          name: sql<string>`IF (${files.id} = ${spacesRoots.fileId}, ${spacesRoots.name}, ${files.name})`.as('name'),
          path: sql<string>`
          CONCAT_WS('/', 
            IF (${files.inTrash} = 0, '${sql.raw(SPACE_REPOSITORY.FILES)}', '${sql.raw(SPACE_REPOSITORY.TRASH)}'), 
            IF (${files.ownerId} = ${userId}, '${sql.raw(SPACE_ALIAS.PERSONAL)}', ${spaces.alias}),
            IF (${spaceRootFile.id} IS NOT NULL,
                IF (${files.id} = ${spaceRootFile.id}, NULL, IF (${files.path} = '.', NULL, REGEXP_REPLACE(${files.path}, ${filePathSQL(spaceRootFile)}, ${spacesRoots.alias}))),
                NULLIF(CONCAT_WS('/', IF (${files.spaceExternalRootId} = ${spacesRoots.id}, ${spacesRoots.alias}, NULL), IF (${files.path} = '.', NULL, ${files.path})), '')
            )
          )`.as('path'),
          mime: files.mime,
          inTrash: sql<number>`${files.inTrash}`.as('inTrash'),
          fromSpace: sql<number>`IF (${files.ownerId} = ${userId}, 0, 1)`.as('fromSpace'),
          fromShare: sql<number>`0`.as('fromShare')
        }
      } satisfies CommentRecent | SelectedFields<any, any>)
      .from(spaces)
      .leftJoin(spacesRoots, eq(spacesRoots.spaceId, spaces.id))
      .leftJoin(spaceRootFile, eq(spaceRootFile.id, spacesRoots.fileId))
      .leftJoin(
        files,
        or(
          // all files from user
          eq(files.ownerId, userId),
          // all files from spaces
          eq(files.spaceId, spaces.id),
          // all files from space roots
          eq(files.id, spacesRoots.fileId),
          // all files under the space roots
          and(
            isNotNull(spaceRootFile.id),
            eq(spaceRootFile.isDir, true),
            sql`${files.ownerId} <=> ${spaceRootFile.ownerId}`,
            sql`${files.path} REGEXP CONCAT('^', IF(${spaceRootFile.path} = '.', CONCAT(${spaceRootFile.name}, '(/.*|)$'), CONCAT(${spaceRootFile.path}, '/')))`
          )
        )
      )
      .innerJoin(comments, and(eq(comments.fileId, files.id), ne(comments.userId, userId)))
      .innerJoin(users, eq(users.id, comments.userId))
      .where(inArray(spaces.id, spaceIds))
      .groupBy(comments.id)
      .orderBy(desc(comments.id))
      .limit(limit)
  }

  async getRecentsFromUser(user: UserModel, limit = 10): Promise<CommentRecent[]> {
    const [spaceIds, shareIds] = await Promise.all([this.spacesQueries.spaceIds(user.id), this.sharesQueries.shareIds(user.id, +user.isAdmin)])
    const fromSpaces = this.getRecentsFromSpaces(user.id, spaceIds, limit * 2)
    const fromShares = this.getRecentsFromShares(user.id, shareIds, limit * 2)
    const unionAlias = union(fromSpaces, fromShares).as('unionAlias')
    return this.db.select().from(unionAlias).groupBy(unionAlias.id).orderBy(desc(unionAlias.id)).limit(limit)
  }
}
