import { Inject, Injectable, Logger } from '@nestjs/common'
import { and, desc, eq, getTableColumns, inArray, isNull, or, SelectedFields, sql, SQL } from 'drizzle-orm'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants'
import { DBSchema } from '../../../infrastructure/database/interfaces/database.interface'
import { concatDistinctObjectsInArray, convertToWhere, dbCheckAffectedRows, dbGetInsertedId } from '../../../infrastructure/database/utils'
import { fileHasCommentsSubquerySQL } from '../../comments/schemas/comments.schema'
import { shares } from '../../shares/schemas/shares.schema'
import { spacesRoots } from '../../spaces/schemas/spaces-roots.schema'
import { spaces } from '../../spaces/schemas/spaces.schema'
import { syncClients } from '../../sync/schemas/sync-clients.schema'
import { syncPaths } from '../../sync/schemas/sync-paths.schema'
import { FileDBProps } from '../interfaces/file-db-props.interface'
import { FileProps } from '../interfaces/file-props.interface'
import type { FileRecent, FileRecentLocation, FileRecentUpdate } from '../schemas/file-recent.interface'
import { File } from '../schemas/file.interface'
import { filesRecents } from '../schemas/files-recents.schema'
import { childFilesFindRegexp, childFilesReplaceRegexp, childPathFindRegexp, filePathSQL, files } from '../schemas/files.schema'
import { dirName, fileName, isPathInside } from '../utils/files'

@Injectable()
export class FilesQueries {
  private readonly logger = new Logger(FilesQueries.name)

  constructor(@Inject(DB_TOKEN_PROVIDER) private readonly db: DBSchema) {}

  browseFiles(
    userId: number,
    dbFile: FileDBProps,
    options: {
      withSpaces?: boolean
      withShares?: boolean
      withSyncs?: boolean
      withHasComments?: boolean
      ignoreChildShares?: boolean
    }
  ): Promise<FileProps[]> {
    const q = this.db
      .select({
        id: files.id,
        path: files.path,
        name: files.name,
        isDir: files.isDir,
        mime: files.mime,
        size: files.size,
        mtime: files.mtime,
        ctime: files.ctime,
        ...(options.withSpaces && { spaces: concatDistinctObjectsInArray(spaces.id, { id: spaces.id, alias: spaces.alias, name: spaces.name }) }),
        ...(options.withShares && {
          shares: concatDistinctObjectsInArray(shares.id, {
            id: shares.id,
            alias: shares.alias,
            name: shares.name,
            type: shares.type
          })
        }),
        ...(options.withSyncs && {
          syncs: concatDistinctObjectsInArray(syncPaths.id, {
            id: syncPaths.id,
            clientId: syncClients.id,
            clientName: sql`JSON_VALUE(${syncClients.info}, '$.node')`
          })
        }),
        ...(options.withHasComments && { hasComments: sql`${fileHasCommentsSubquerySQL(files.id)}`.mapWith(Boolean) })
      })
      .from(files)
      .where(and(...convertToWhere(files, dbFile)))
      .groupBy(files.id)
    if (options.withSpaces) {
      // show spaces for files in personal space
      q.leftJoin(spacesRoots, eq(spacesRoots.fileId, files.id))
      q.leftJoin(spaces, eq(spaces.id, spacesRoots.spaceId))
    }
    if (options.withShares) {
      q.leftJoin(
        shares,
        and(...[eq(shares.ownerId, userId), eq(shares.fileId, files.id)], ...(options.ignoreChildShares ? [isNull(shares.parentId)] : []))
      )
    }
    if (options.withSyncs) {
      q.leftJoin(syncClients, eq(syncClients.ownerId, userId))
      q.leftJoin(syncPaths, and(eq(syncPaths.clientId, syncClients.id), eq(syncPaths.fileId, files.id)))
    }
    return q
  }

  async getUserFile(userId: number, fileId: number): Promise<Pick<File, 'id' | 'path'>> {
    if (fileId > 0) {
      const [fileInDB] = await this.db
        .select({ id: files.id, path: filePathSQL(files) })
        .from(files)
        .where(and(eq(files.ownerId, userId), eq(files.id, fileId)))
        .limit(1)
      return fileInDB
    }
    return null
  }

  async getOrCreateUserFile(userId: number, file: FileProps): Promise<number> {
    if (file.id && file.id > 0) {
      const [searchFileInDB] = await this.db
        .select({ id: files.id })
        .from(files)
        .where(and(eq(files.ownerId, userId), eq(files.id, file.id)))
        .limit(1)
      if (searchFileInDB?.id === file.id) {
        return file.id
      } else {
        this.logger.warn({ tag: this.getOrCreateUserFile.name, msg: `file mismatch : ${JSON.stringify(searchFileInDB)} !== ${JSON.stringify(file)}` })
      }
    }
    return dbGetInsertedId(await this.db.insert(files).values({ ...file, id: undefined, ownerId: userId } as File))
  }

  async getOrCreateSpaceFile(fileId: number, file: FileProps, dbFile: FileDBProps): Promise<number> {
    // `isDir` is intentionally excluded here: this flow reconciles an existing path before insert,
    // even if the caller has a stale file/dir kind for the same location.
    const fileInDB = {
      ...dbFile,
      name: file.name,
      path: file.path
    }
    const hasDbFileId = Number.isSafeInteger(fileId) && fileId > 0
    if (hasDbFileId) {
      const [searchFileInDB] = await this.db
        .select({ id: files.id })
        .from(files)
        .where(and(...convertToWhere(files, fileInDB), eq(files.id, fileId)))
        .limit(1)
      if (searchFileInDB?.id === fileId) {
        return fileId
      } else {
        this.logger.warn({
          tag: this.getOrCreateSpaceFile.name,
          msg: `file mismatch : ${JSON.stringify(dbFile)} -> ${fileId} !== ${searchFileInDB?.id}`
        })
      }
    }

    // Before inserting, check whether a record already exists at this path to avoid
    // creating duplicate rows when repeated calls index the same file.
    const existingId = await this.getSpaceFileId(file, dbFile, { withDir: false })
    if (existingId !== undefined) return existingId

    // `fileInDB` keeps the DB scope and uses the `FileProps` path/name.
    return dbGetInsertedId(await this.db.insert(files).values({ ...file, ...fileInDB, id: undefined } as File))
  }

  async getSpaceFileId(file: FileProps, dbFile: FileDBProps, options: { withDir?: boolean } = {}): Promise<number | undefined> {
    const fileInDB = {
      ...dbFile,
      name: file.name,
      path: file.path,
      ...(options.withDir !== false && { isDir: file.isDir })
    }
    const [searchFileInDB] = await this.db
      .select({ id: files.id })
      .from(files)
      .where(and(...convertToWhere(files, fileInDB)))
      .limit(1)
    return searchFileInDB?.id
  }

  async updateFile(id: number, file: Partial<FileProps>): Promise<void> {
    try {
      dbCheckAffectedRows(await this.db.update(files).set(file).where(eq(files.id, id)), 1)
    } catch (e) {
      this.logger.error({ tag: this.updateFile.name, msg: `file (${id}) properties was not updated : ${e}` })
    }
  }

  async deleteFiles(props: FileDBProps, isDir: boolean, force = false): Promise<void> {
    const commonProps: Omit<FileDBProps, 'path'> = {
      ownerId: props.ownerId || null,
      spaceId: props.spaceId || null,
      spaceExternalRootId: props.spaceExternalRootId || null,
      shareExternalId: props.shareExternalId || null,
      inTrash: props.inTrash
    }

    // prepare file update/delete
    const fileProps: FileDBProps & { name: string; isDir: boolean } = {
      ...commonProps,
      path: dirName(props.path),
      name: fileName(props.path),
      isDir: isDir
    }

    // prepare (or not) the child files update/delete
    const childFiles = isDir ? childFilesFindRegexp(props.path) : null
    if (fileProps.inTrash || force) {
      // delete file
      await this.db.delete(files).where(and(...convertToWhere(files, fileProps)))
      if (childFiles) {
        // delete child files
        await this.db.delete(files).where(and(...[...convertToWhere(files, commonProps), childFiles]))
      }
    } else {
      // move file to trash
      await this.db
        .update(files)
        .set({ inTrash: true } as File)
        .where(and(...convertToWhere(files, fileProps)))
      if (childFiles) {
        // move child files to trash
        await this.db
          .update(files)
          .set({ inTrash: true } as File)
          .where(and(...convertToWhere(files, commonProps), childFiles))
      }
    }
  }

  async moveFiles(srcProps: FileDBProps, dstProps: FileDBProps, isDir: boolean): Promise<void> {
    const srcCommonProps: Omit<FileDBProps, 'path'> = {
      ownerId: srcProps.ownerId || null,
      spaceId: srcProps.spaceId || null,
      spaceExternalRootId: srcProps.spaceExternalRootId || null,
      shareExternalId: srcProps.shareExternalId || null,
      inTrash: srcProps.inTrash
    }
    const dstCommonProps: Omit<FileDBProps, 'path'> = {
      ownerId: dstProps.ownerId || null,
      spaceId: dstProps.spaceId || null,
      spaceExternalRootId: dstProps.spaceExternalRootId || null,
      shareExternalId: dstProps.shareExternalId || null,
      inTrash: dstProps.inTrash
    }

    // prepare file props update
    const srcFileDB: FileDBProps & { name: string; isDir: boolean } = {
      ...srcCommonProps,
      path: dirName(srcProps.path),
      name: fileName(srcProps.path),
      isDir: isDir
    }
    const dstFileDB: FileDBProps & { name: string; isDir: boolean } = {
      ...dstCommonProps,
      path: dirName(dstProps.path),
      name: fileName(dstProps.path),
      isDir: isDir
    }

    // update file props
    await this.db
      .update(files)
      .set(dstFileDB)
      .where(and(...convertToWhere(files, srcFileDB)))
    if (isDir) {
      // prepare child file props update
      const childFiles: SQL<string> = childFilesFindRegexp(srcProps.path)
      const childProps: Omit<FileDBProps, 'path'> & { path: SQL<string> } = {
        ...dstCommonProps,
        path: childFilesReplaceRegexp(srcProps.path, dstProps.path)
      }
      // update child file props
      await this.db
        .update(files)
        .set(childProps)
        .where(and(...convertToWhere(files, srcCommonProps), childFiles))
    }
  }

  async compareAndUpdateFileProps(dbFile: FileProps, fsFile: FileProps): Promise<void> {
    if (
      dbFile.isDir !== fsFile.isDir ||
      dbFile.size !== fsFile.size ||
      dbFile.ctime !== fsFile.ctime ||
      dbFile.mtime !== fsFile.mtime ||
      dbFile.mime !== fsFile.mime
    ) {
      this.logger.verbose({ tag: this.compareAndUpdateFileProps.name, msg: `${dbFile.path} (${dbFile.id})` })
      await this.updateFile(dbFile.id, {
        isDir: fsFile.isDir,
        size: fsFile.size,
        ctime: fsFile.ctime,
        mtime: fsFile.mtime,
        mime: fsFile.mime
      })
    }
  }

  getRecentsFromUser(userId: number | undefined, spaceIds: number[], shareIds: number[], limit = 10): Promise<FileRecent[]> {
    const where: SQL[] = [
      ...(userId !== undefined ? [eq(filesRecents.ownerId, userId)] : []),
      ...(spaceIds.length ? [inArray(filesRecents.spaceId, spaceIds)] : []),
      ...(shareIds.length ? [inArray(filesRecents.shareId, shareIds)] : [])
    ]
    if (!where.length) {
      return Promise.resolve([])
    }
    return this.db
      .select({
        id: filesRecents.id,
        ownerId: sql<number>`IF(${filesRecents.ownerId} IS NULL, 0, 1)`.as('ownerId'),
        spaceId: sql<number>`IF(${filesRecents.spaceId} IS NULL, 0, 1)`.as('spaceId'),
        shareId: sql<number>`IF(${filesRecents.shareId} IS NULL, 0, 1)`.as('shareId'),
        path: filesRecents.path,
        name: filesRecents.name,
        mime: filesRecents.mime,
        mtime: filesRecents.mtime
      } satisfies FileRecent | SelectedFields<any, any>)
      .from(filesRecents)
      .where(or(...where))
      .groupBy(filesRecents.id)
      .orderBy(desc(filesRecents.mtime))
      .limit(limit)
  }

  getRecentsFromLocation(location: FileRecentLocation): Promise<FileRecent[]> {
    const where: SQL[] = convertToWhere(filesRecents, location)
    return this.db
      .select(getTableColumns(filesRecents))
      .from(filesRecents)
      .where(and(...where))
  }

  async deleteRecents(locations: FileRecentLocation[]): Promise<void> {
    const groups = new Map<string, { repository: Omit<FileRecentLocation, 'path'>; paths: Set<string> }>()
    for (const { path: sourcePath, ...repository } of locations) {
      const key = JSON.stringify(repository)
      const group = groups.get(key)
      if (group) {
        group.paths.add(sourcePath)
      } else {
        groups.set(key, { repository, paths: new Set([sourcePath]) })
      }
    }

    const batchSize = 50
    for (const { repository, paths } of groups.values()) {
      const compactPaths: string[] = []
      for (const sourcePath of [...paths].sort((a, b) => a.length - b.length)) {
        if (!compactPaths.some((parentPath) => isPathInside(parentPath, sourcePath, true))) compactPaths.push(sourcePath)
      }
      const where: SQL[] = convertToWhere(filesRecents, repository)
      for (let offset = 0; offset < compactPaths.length; offset += batchSize) {
        const batch = compactPaths.slice(offset, offset + batchSize)
        try {
          await this.db
            .delete(filesRecents)
            .where(and(...where, or(...batch.map((sourcePath) => childPathFindRegexp(filePathSQL(filesRecents), sourcePath)))))
        } catch (e) {
          this.logger.error({ tag: this.deleteRecents.name, msg: `${e}` })
        }
      }
    }
  }

  async replaceRecents(location: FileRecentLocation, recents: FileRecent[]): Promise<void> {
    const where: SQL[] = convertToWhere(filesRecents, location)
    await this.db.transaction(async (tx) => {
      await tx.delete(filesRecents).where(and(...where))
      if (recents.length) await tx.insert(filesRecents).values(recents)
    })
  }

  async upsertRecent(location: FileRecentLocation, recent: FileRecent): Promise<void> {
    const where: SQL[] = convertToWhere(filesRecents, location)
    await this.db.transaction(async (tx) => {
      // The table has no unique key: replacing by logical location also removes a stale inode identity.
      await tx.delete(filesRecents).where(and(...where, eq(filesRecents.name, recent.name)))
      await tx.insert(filesRecents).values(recent)
    })
  }

  async updateRecents(location: FileRecentLocation, add: FileRecent[], update: FileRecentUpdate[], remove: FileRecent['id'][]): Promise<void> {
    const where: SQL[] = convertToWhere(filesRecents, location)
    // add
    if (add.length) {
      try {
        await this.db.insert(filesRecents).values(add)
      } catch (e) {
        this.logger.error({ tag: this.updateRecents.name, msg: `${e}` })
      }
    }
    // update
    if (update.length) {
      for (const { id, ...props } of update) {
        try {
          await this.db
            .update(filesRecents)
            .set(props)
            .where(and(...where, eq(filesRecents.id, id)))
        } catch (e) {
          this.logger.error({ tag: this.updateRecents.name, msg: `${e}` })
        }
      }
    }
    // remove
    if (remove.length) {
      try {
        await this.db.delete(filesRecents).where(and(...where, inArray(filesRecents.id, remove)))
      } catch (e) {
        this.logger.error({ tag: this.updateRecents.name, msg: `${e}` })
      }
    }
  }
}
