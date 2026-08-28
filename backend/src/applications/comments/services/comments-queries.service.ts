import { Inject, Injectable } from '@nestjs/common'
import { and, desc, eq, getTableColumns, inArray, isNotNull, isNull, ne, or, SelectedFields, SQL, sql } from 'drizzle-orm'
import { alias, union } from 'drizzle-orm/mysql-core'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants'
import type { DBSchema } from '../../../infrastructure/database/interfaces/database.interface'
import { dbCheckAffectedRows, dbGetInsertedId } from '../../../infrastructure/database/utils'
import { filePathSQL, files } from '../../files/schemas/files.schema'
import { UserMailNotification } from '../../notifications/interfaces/user-mail-notification.interface'
import { shares } from '../../shares/schemas/shares.schema'
import { externalShareScopeSQL } from '../../shares/utils/external-share-scope.sql'
import { SharesQueries } from '../../shares/services/shares-queries.service'
import { SPACE_ALIAS, SPACE_REPOSITORY } from '../../spaces/constants/spaces'
import { spacesRoots } from '../../spaces/schemas/spaces-roots.schema'
import { spaces } from '../../spaces/schemas/spaces.schema'
import { SpacesQueries } from '../../spaces/services/spaces-queries.service'
import { USER_PERMISSION } from '../../users/constants/user'
import { UserModel } from '../../users/models/user.model'
import { userFullNameSQL, users } from '../../users/schemas/users.schema'
import { COMMENTS_RECENTS_MAX_LIMIT } from '../constants/recents'
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
        author: { login: users.login, fullName: userFullNameSQL(users), email: users.email, isAuthor: eq(users.id, userId).mapWith(Boolean) },
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
    const externalShareTargets = this.db
      .select({ id: shares.id, parentId: shares.parentId, externalPath: shares.externalPath })
      .from(shares)
      .where(and(isNull(shares.fileId), isNotNull(shares.externalPath), inArray(shares.id, shareIds)))
    const externalShareScope = externalShareScopeSQL(externalShareTargets, 'commentExternalShareScope', {
      oneTargetPerStorage: true
    })
    return this.db
      .select({
        id: comments.id,
        content: comments.content,
        modifiedAt: comments.modifiedAt,
        author: { login: users.login, fullName: userFullNameSQL(users).as('fullName'), email: users.email },
        file: {
          name: sql<string>`IF (${files.id} = ${shareFile.id}, ${shares.name}, ${files.name})`.as('name'),
          path: sql<string>`
          CONCAT_WS('/', ${SPACE_REPOSITORY.SHARES},
            IF (${shareFile.id} IS NOT NULL,
              IF (${files.id} = ${shareFile.id}, NULL, REGEXP_REPLACE(${files.path}, ${filePathSQL(shareFile)}, ${shares.alias})),
              CONCAT_WS('/', ${shares.alias}, IF (${files.path} = '.', NULL, ${files.path}))
            )
          )`.as('path'),
          mime: files.mime,
          inTrash: sql<number>`0`.as('inTrash'),
          fromSpace: sql<number>`0`.as('fromSpace'),
          fromShare: sql<number>`1`.as('fromShare'),
          displayRootName: shares.name
        }
      } satisfies CommentRecent | SelectedFields<any, any>)
      .from(shares)
      .leftJoin(shareFile, eq(shareFile.id, shares.fileId))
      .leftJoin(spaces, eq(spaces.id, shareFile.spaceId))
      .leftJoin(spacesRoots, eq(spacesRoots.spaceId, spaces.id))
      .leftJoin(externalShareScope.table, eq(externalShareScope.targetShareId, shares.id))
      .leftJoin(
        files,
        or(
          // file linked to the share
          eq(files.id, shareFile.id),
          // all files with an external share id
          and(isNull(shareFile.id), eq(files.shareExternalId, externalShareScope.storageShareId)),
          // all files under the share
          and(
            isNotNull(shareFile.id),
            eq(shareFile.isDir, true),
            // A file moved to trash leaves the storage scope of its former share root.
            eq(files.inTrash, shareFile.inTrash),
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

  getRecentsFromPersonal(userId: number, limit: number) {
    return this.db
      .select({
        id: comments.id,
        content: comments.content,
        modifiedAt: comments.modifiedAt,
        author: { login: users.login, fullName: userFullNameSQL(users).as('fullName'), email: users.email },
        file: {
          name: files.name,
          path: sql<string>`
          CONCAT_WS('/', 
            IF (${files.inTrash} = 0, ${SPACE_REPOSITORY.FILES}, ${SPACE_REPOSITORY.TRASH}),
            ${SPACE_ALIAS.PERSONAL},
            IF (${files.path} = '.', NULL, ${files.path})
          )`.as('path'),
          mime: files.mime,
          inTrash: sql<number>`${files.inTrash}`.as('inTrash'),
          fromSpace: sql<number>`0`.as('fromSpace'),
          fromShare: sql<number>`0`.as('fromShare')
        }
      } satisfies CommentRecent | SelectedFields<any, any>)
      .from(files)
      .innerJoin(comments, and(eq(comments.fileId, files.id), ne(comments.userId, userId)))
      .innerJoin(users, eq(users.id, comments.userId))
      .where(eq(files.ownerId, userId))
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
            IF (${files.inTrash} = 0, ${SPACE_REPOSITORY.FILES}, ${SPACE_REPOSITORY.TRASH}),
            IF (${files.ownerId} = ${userId}, ${SPACE_ALIAS.PERSONAL}, ${spaces.alias}),
            IF (${spaceRootFile.id} IS NOT NULL,
                IF (${files.id} = ${spaceRootFile.id}, NULL, IF (${files.path} = '.', NULL, REGEXP_REPLACE(${files.path}, ${filePathSQL(spaceRootFile)}, ${spacesRoots.alias}))),
                NULLIF(CONCAT_WS('/', IF (${files.spaceExternalRootId} = ${spacesRoots.id}, ${spacesRoots.alias}, NULL), IF (${files.path} = '.', NULL, ${files.path})), '')
            )
          )`.as('path'),
          mime: files.mime,
          inTrash: sql<number>`${files.inTrash}`.as('inTrash'),
          fromSpace: sql<number>`IF (${files.ownerId} = ${userId}, 0, 1)`.as('fromSpace'),
          fromShare: sql<number>`0`.as('fromShare'),
          displayRootName: sql<string>`IF (${files.ownerId} = ${userId}, NULL, ${spaces.name})`.as('displayRootName')
        }
      } satisfies CommentRecent | SelectedFields<any, any>)
      .from(spaces)
      .leftJoin(spacesRoots, eq(spacesRoots.spaceId, spaces.id))
      .leftJoin(spaceRootFile, eq(spaceRootFile.id, spacesRoots.fileId))
      .leftJoin(
        files,
        or(
          // all files from spaces
          eq(files.spaceId, spaces.id),
          // all files from space roots
          eq(files.id, spacesRoots.fileId),
          // all files under the space roots
          and(
            isNotNull(spaceRootFile.id),
            eq(spaceRootFile.isDir, true),
            // A file moved to trash leaves the storage scope of its former anchored root.
            eq(files.inTrash, spaceRootFile.inTrash),
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

  async getRecentsFromUser(user: UserModel, limit: number): Promise<CommentRecent[]> {
    const recentsLimit = Math.min(limit, COMMENTS_RECENTS_MAX_LIMIT)
    const hasPersonal = user.havePermission(USER_PERMISSION.PERSONAL_SPACE)
    const [spaces, shares] = await Promise.all([
      user.havePermission(USER_PERMISSION.SPACES) ? this.spacesQueries.spaceIdentities(user.id) : Promise.resolve([]),
      user.havePermission(USER_PERMISSION.SHARES) ? this.sharesQueries.shareIdentities(user.id, +user.isAdmin) : Promise.resolve([])
    ])
    const spaceIds = spaces.map(({ id }) => id)
    const shareIds = shares.map(({ id }) => id)
    const hasSpaces = spaceIds.length > 0
    const hasShares = shareIds.length > 0
    const sourceCount = +hasPersonal + +hasSpaces + +hasShares
    const sourceLimit = sourceCount > 1 ? recentsLimit * 2 : recentsLimit
    const sourceRecents = await Promise.all([
      hasPersonal ? this.getRecentsFromPersonal(user.id, sourceLimit) : Promise.resolve([]),
      hasSpaces ? this.getRecentsFromSpaces(user.id, spaceIds, sourceLimit) : Promise.resolve([]),
      hasShares ? this.getRecentsFromShares(user.id, shareIds, sourceLimit) : Promise.resolve([])
    ])
    const recents = sourceRecents.flat().sort((a, b) => b.id - a.id)
    return Array.from(new Map(recents.map((r) => [r.id, r])).values()).slice(0, recentsLimit)
  }
}
