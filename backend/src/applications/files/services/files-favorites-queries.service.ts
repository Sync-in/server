import { Inject, Injectable } from '@nestjs/common'
import { and, desc, eq, inArray, isNotNull, isNull, or, SelectedFields, sql } from 'drizzle-orm'
import { alias, unionAll } from 'drizzle-orm/mysql-core'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants'
import type { DBSchema } from '../../../infrastructure/database/interfaces/database.interface'
import { concatDistinctObjectsInArray } from '../../../infrastructure/database/utils'
import { fileHasCommentsSubquerySQL } from '../../comments/schemas/comments.schema'
import { shares } from '../../shares/schemas/shares.schema'
import { externalShareScopeSQL } from '../../shares/utils/external-share-scope.sql'
import { SPACE_ALIAS, SPACE_REPOSITORY } from '../../spaces/constants/spaces'
import { spacesRoots } from '../../spaces/schemas/spaces-roots.schema'
import { spaces } from '../../spaces/schemas/spaces.schema'
import { syncClients } from '../../sync/schemas/sync-clients.schema'
import { syncPaths } from '../../sync/schemas/sync-paths.schema'
import { FILE_REPOSITORY } from '../constants/operations'
import type { FileFavorite, FileFavoriteLocation, FileFavoriteRepository } from '../schemas/file-favorite.interface'
import { filesFavorites } from '../schemas/files-favorites.schema'
import { filePathSQL, files } from '../schemas/files.schema'

@Injectable()
export class FilesFavoritesQueries {
  constructor(@Inject(DB_TOKEN_PROVIDER) private readonly db: DBSchema) {}

  getFavoritesFromUser(userId: number, withPersonal: boolean, withSyncs: boolean): Promise<FileFavorite[]> {
    const isPersonal = sql`${+withPersonal} = 1 AND ${files.ownerId} <=> ${userId}`
    const q = this.db
      .select({
        fileId: filesFavorites.fileId,
        createdAt: filesFavorites.createdAt,
        isDisabled: sql<boolean>`NOT (${isPersonal})`.mapWith(Boolean),
        id: files.id,
        path: sql<string>`
          IF (${isPersonal},
            CONCAT_WS('/',
              IF (${files.inTrash} = 0, ${SPACE_REPOSITORY.FILES}, ${SPACE_REPOSITORY.TRASH}),
              ${SPACE_ALIAS.PERSONAL},
              IF (${files.path} = '.', NULL, ${files.path})
            ),
            ${files.path}
          )
        `.as('path'),
        name: files.name,
        isDir: files.isDir,
        inTrash: files.inTrash,
        mime: files.mime,
        size: files.size,
        mtime: files.mtime,
        ctime: files.ctime,
        spaces: concatDistinctObjectsInArray(spaces.id, { id: spaces.id, alias: spaces.alias, name: spaces.name }),
        shares: concatDistinctObjectsInArray(shares.id, {
          id: shares.id,
          alias: shares.alias,
          name: shares.name,
          type: shares.type
        }),
        ...(withSyncs && {
          syncs: concatDistinctObjectsInArray(syncPaths.id, {
            id: syncPaths.id,
            clientId: syncClients.id,
            clientName: sql`JSON_VALUE(${syncClients.info}, '$.node')`
          })
        }),
        hasComments: sql`${fileHasCommentsSubquerySQL(files.id)}`.mapWith(Boolean),
        repository: sql<FileFavoriteRepository>`IF (${isPersonal}, ${SPACE_ALIAS.PERSONAL}, NULL)`.as('repository'),
        displayRootName: sql<string>`NULL`.as('displayRootName')
      } satisfies FileFavorite | SelectedFields<any, any>)
      .from(filesFavorites)
      .innerJoin(files, eq(files.id, filesFavorites.fileId))
      .leftJoin(spacesRoots, and(isPersonal, eq(spacesRoots.fileId, files.id)))
      .leftJoin(spaces, eq(spaces.id, spacesRoots.spaceId))
      .leftJoin(shares, and(eq(shares.ownerId, userId), eq(shares.fileId, files.id), isNull(shares.parentId)))
    if (withSyncs) {
      q.leftJoin(syncClients, eq(syncClients.ownerId, userId))
      q.leftJoin(syncPaths, and(eq(syncPaths.clientId, syncClients.id), eq(syncPaths.fileId, files.id)))
    }
    return q
      .where(eq(filesFavorites.userId, userId))
      .groupBy(files.id, filesFavorites.createdAt)
      .orderBy(desc(filesFavorites.createdAt), desc(filesFavorites.fileId))
  }

  getFavoriteLocationsFromSpaces(userId: number, spaceIds: number[]): Promise<FileFavoriteLocation[]> {
    if (!spaceIds.length) return Promise.resolve([])
    const directSpaceRoot: any = alias(spacesRoots, 'favoriteDirectSpaceRoot')
    const anchoredSpaceRoot: any = alias(spacesRoots, 'favoriteAnchoredSpaceRoot')
    const spaceRootFile: any = alias(files, 'favoriteSpaceRootFile')
    const fileFromSpaceRoot = or(
      eq(files.id, spaceRootFile.id),
      and(
        eq(spaceRootFile.isDir, true),
        // A file moved to trash leaves the storage scope of its former anchored root.
        eq(files.inTrash, spaceRootFile.inTrash),
        sql`${files.spaceId} <=> ${spaceRootFile.spaceId}`,
        sql`${files.ownerId} <=> ${spaceRootFile.ownerId}`,
        sql`${files.spaceExternalRootId} <=> ${spaceRootFile.spaceExternalRootId}`,
        sql`${files.shareExternalId} <=> ${spaceRootFile.shareExternalId}`,
        sql`LEFT(CONCAT(${files.path}, '/'), CHAR_LENGTH(${filePathSQL(spaceRootFile)}) + 1) = CONCAT(${filePathSQL(spaceRootFile)}, '/')`
      )
    )
    const directFiles = this.db
      .select({
        fileId: sql<number>`${files.id}`.as('fileId'),
        repository: sql<FileFavoriteRepository>`${FILE_REPOSITORY.SPACE}`.as('repository'),
        path: sql<string>`
          CONCAT_WS('/',
            IF (${files.inTrash} = 0, ${SPACE_REPOSITORY.FILES}, ${SPACE_REPOSITORY.TRASH}),
            ${spaces.alias},
            IF (${files.spaceExternalRootId} IS NULL, NULL, ${directSpaceRoot.alias}),
            IF (${files.path} = '.', NULL, ${files.path})
          )
        `.as('path'),
        name: sql<string>`${files.name}`.as('name'),
        displayRootName: sql<string>`${spaces.name}`.as('displayRootName'),
        contextId: sql<number>`${spaces.id}`.as('contextId'),
        rootId: sql<number>`0`.as('rootId')
      } satisfies FileFavoriteLocation | SelectedFields<any, any>)
      .from(filesFavorites)
      .innerJoin(files, eq(files.id, filesFavorites.fileId))
      .innerJoin(spaces, and(eq(spaces.id, files.spaceId), inArray(spaces.id, spaceIds), eq(spaces.enabled, true)))
      .leftJoin(directSpaceRoot, eq(directSpaceRoot.id, files.spaceExternalRootId))
      .where(eq(filesFavorites.userId, userId))
    const anchoredFiles = this.db
      .select({
        fileId: sql<number>`${files.id}`.as('fileId'),
        repository: sql<FileFavoriteRepository>`${FILE_REPOSITORY.SPACE}`.as('repository'),
        path: sql<string>`
          CONCAT_WS('/',
            IF (${files.inTrash} = 0, ${SPACE_REPOSITORY.FILES}, ${SPACE_REPOSITORY.TRASH}),
            ${spaces.alias},
            IF (
              ${files.id} = ${spaceRootFile.id},
              NULL,
              CONCAT(${anchoredSpaceRoot.alias}, SUBSTRING(${files.path}, CHAR_LENGTH(${filePathSQL(spaceRootFile)}) + 1))
            )
          )
        `.as('path'),
        name: sql<string>`IF (${files.id} = ${spaceRootFile.id}, ${anchoredSpaceRoot.name}, ${files.name})`.as('name'),
        displayRootName: sql<string>`${spaces.name}`.as('displayRootName'),
        contextId: sql<number>`${spaces.id}`.as('contextId'),
        rootId: sql<number>`${anchoredSpaceRoot.id}`.as('rootId')
      } satisfies FileFavoriteLocation | SelectedFields<any, any>)
      .from(filesFavorites)
      .innerJoin(files, eq(files.id, filesFavorites.fileId))
      .innerJoin(spaceRootFile, fileFromSpaceRoot)
      .innerJoin(anchoredSpaceRoot, eq(anchoredSpaceRoot.fileId, spaceRootFile.id))
      .innerJoin(spaces, and(eq(spaces.id, anchoredSpaceRoot.spaceId), inArray(spaces.id, spaceIds), eq(spaces.enabled, true)))
      .where(eq(filesFavorites.userId, userId))
    return unionAll(directFiles, anchoredFiles)
  }

  getFavoriteLocationsFromShares(userId: number, shareIds: number[]): Promise<FileFavoriteLocation[]> {
    if (!shareIds.length) return Promise.resolve([])
    const directShareRootFile: any = alias(files, 'favoriteDirectShareRootFile')
    const directShareSpaceRoot: any = alias(spacesRoots, 'favoriteDirectShareSpaceRoot')
    const spaceShareRootFile: any = alias(files, 'favoriteSpaceShareRootFile')
    const spaceShareRoot: any = alias(spacesRoots, 'favoriteSpaceShareRoot')
    const externalShareSpaceRoot: any = alias(spacesRoots, 'favoriteExternalShareSpaceRoot')
    const externalSpaceRoot: any = alias(spacesRoots, 'favoriteExternalSpaceRoot')
    const fileFromRoot = (rootFile: any) =>
      or(
        eq(files.id, rootFile.id),
        and(
          eq(rootFile.isDir, true),
          // A file moved to trash leaves the storage scope of its former share root.
          eq(files.inTrash, rootFile.inTrash),
          sql`${files.spaceId} <=> ${rootFile.spaceId}`,
          sql`${files.ownerId} <=> ${rootFile.ownerId}`,
          sql`${files.spaceExternalRootId} <=> ${rootFile.spaceExternalRootId}`,
          sql`${files.shareExternalId} <=> ${rootFile.shareExternalId}`,
          sql`LEFT(CONCAT(${files.path}, '/'), CHAR_LENGTH(${filePathSQL(rootFile)}) + 1) = CONCAT(${filePathSQL(rootFile)}, '/')`
        )
      )
    const rootLocationSelect = (rootFile: any, spaceRoot: any) =>
      ({
        fileId: sql<number>`${files.id}`.as('fileId'),
        repository: sql<FileFavoriteRepository>`${FILE_REPOSITORY.SHARE}`.as('repository'),
        path: sql<string>`
          CONCAT_WS('/', ${SPACE_REPOSITORY.SHARES},
            IF (
              ${files.id} = ${rootFile.id},
              NULL,
              CONCAT(${shares.alias}, SUBSTRING(${files.path}, CHAR_LENGTH(${filePathSQL(rootFile)}) + 1))
            )
          )
        `.as('path'),
        name: sql<string>`IF (${files.id} = ${rootFile.id}, ${shares.name}, ${files.name})`.as('name'),
        displayRootName: sql<string>`${shares.name}`.as('displayRootName'),
        contextId: sql<number>`${shares.id}`.as('contextId'),
        rootId: sql<number>`COALESCE(${spaceRoot.id}, 0)`.as('rootId')
      }) satisfies FileFavoriteLocation | SelectedFields<any, any>
    const externalLocationSelect = (spaceRoot: any) =>
      ({
        fileId: sql<number>`${files.id}`.as('fileId'),
        repository: sql<FileFavoriteRepository>`${FILE_REPOSITORY.SHARE}`.as('repository'),
        path: sql<string>`
          CONCAT_WS('/',
            ${SPACE_REPOSITORY.SHARES},
            ${shares.alias},
            IF (${files.path} = '.', NULL, ${files.path})
          )
        `.as('path'),
        name: sql<string>`${files.name}`.as('name'),
        displayRootName: sql<string>`${shares.name}`.as('displayRootName'),
        contextId: sql<number>`${shares.id}`.as('contextId'),
        rootId: sql<number>`COALESCE(${spaceRoot.id}, 0)`.as('rootId')
      }) satisfies FileFavoriteLocation | SelectedFields<any, any>
    const externalShareTargets = this.db
      .select({ id: shares.id, parentId: shares.parentId, externalPath: shares.externalPath })
      .from(shares)
      .where(and(isNull(shares.fileId), isNotNull(shares.externalPath), inArray(shares.id, shareIds), eq(shares.enabled, true)))
    const externalShareScope = externalShareScopeSQL(externalShareTargets, 'favoriteExternalShareScope', {
      oneTargetPerStorage: true
    })
    const directShareFiles = this.db
      .select(rootLocationSelect(directShareRootFile, directShareSpaceRoot))
      .from(filesFavorites)
      .innerJoin(files, eq(files.id, filesFavorites.fileId))
      .innerJoin(directShareRootFile, fileFromRoot(directShareRootFile))
      .innerJoin(shares, and(eq(shares.fileId, directShareRootFile.id), inArray(shares.id, shareIds), eq(shares.enabled, true)))
      .leftJoin(directShareSpaceRoot, eq(directShareSpaceRoot.id, shares.spaceRootId))
      .where(eq(filesFavorites.userId, userId))
    const spaceRootShareFiles = this.db
      .select(rootLocationSelect(spaceShareRootFile, spaceShareRoot))
      .from(filesFavorites)
      .innerJoin(files, eq(files.id, filesFavorites.fileId))
      .innerJoin(spaceShareRootFile, fileFromRoot(spaceShareRootFile))
      .innerJoin(spaceShareRoot, eq(spaceShareRoot.fileId, spaceShareRootFile.id))
      .innerJoin(
        shares,
        and(isNull(shares.fileId), eq(shares.spaceRootId, spaceShareRoot.id), inArray(shares.id, shareIds), eq(shares.enabled, true))
      )
      .where(eq(filesFavorites.userId, userId))
    const externalShareFiles = this.db
      .select(externalLocationSelect(externalShareSpaceRoot))
      .from(filesFavorites)
      .innerJoin(files, eq(files.id, filesFavorites.fileId))
      .innerJoin(externalShareScope.table, eq(externalShareScope.storageShareId, files.shareExternalId))
      .innerJoin(shares, eq(shares.id, externalShareScope.targetShareId))
      .leftJoin(externalShareSpaceRoot, eq(externalShareSpaceRoot.id, shares.spaceRootId))
      .where(and(eq(filesFavorites.userId, userId), isNull(externalShareSpaceRoot.fileId)))
    const externalSpaceRootFiles = this.db
      .select(externalLocationSelect(externalSpaceRoot))
      .from(filesFavorites)
      .innerJoin(files, eq(files.id, filesFavorites.fileId))
      .innerJoin(
        externalSpaceRoot,
        and(
          eq(externalSpaceRoot.id, files.spaceExternalRootId),
          eq(externalSpaceRoot.spaceId, files.spaceId),
          isNull(externalSpaceRoot.fileId),
          isNotNull(externalSpaceRoot.externalPath)
        )
      )
      .innerJoin(
        shares,
        and(isNull(shares.fileId), eq(shares.spaceRootId, externalSpaceRoot.id), inArray(shares.id, shareIds), eq(shares.enabled, true))
      )
      .where(eq(filesFavorites.userId, userId))
    return unionAll(directShareFiles, spaceRootShareFiles, externalShareFiles, externalSpaceRootFiles)
  }

  async addFavorite(userId: number, fileId: number): Promise<void> {
    await this.db.insert(filesFavorites).values({ userId, fileId }).onDuplicateKeyUpdate({ set: { fileId } })
  }

  async removeFavorite(userId: number, fileId: number): Promise<void> {
    await this.db
      .delete(filesFavorites)
      .where(and(eq(filesFavorites.userId, userId), eq(filesFavorites.fileId, fileId)))
      .limit(1)
  }
}
