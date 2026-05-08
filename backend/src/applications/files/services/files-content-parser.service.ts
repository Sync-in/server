import { Inject, Injectable, Logger } from '@nestjs/common'
import { and, eq, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm'
import path from 'node:path'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants'
import { DBSchema } from '../../../infrastructure/database/interfaces/database.interface'
import { concatDistinctObjectsInArray } from '../../../infrastructure/database/utils'
import { SHARE_TYPE } from '../../shares/constants/shares'
import { shares } from '../../shares/schemas/shares.schema'
import { SPACE_ALIAS, SPACE_REPOSITORY } from '../../spaces/constants/spaces'
import { SpaceModel } from '../../spaces/models/space.model'
import { spacesRoots } from '../../spaces/schemas/spaces-roots.schema'
import { spaces } from '../../spaces/schemas/spaces.schema'
import { USER_ROLE } from '../../users/constants/user'
import { UserModel } from '../../users/models/user.model'
import { users } from '../../users/schemas/users.schema'
import { FileParseContentPath, FileParseContext } from '../interfaces/file-parse-index'
import { filePathSQL, files } from '../schemas/files.schema'
import { isPathExists } from '../utils/files'
import { FILE_REPOSITORY } from '../constants/operations'

@Injectable()
export class FilesContentParser {
  private readonly logger = new Logger(FilesContentParser.name)

  constructor(@Inject(DB_TOKEN_PROVIDER) private readonly db: DBSchema) {}

  async allPaths(userIds?: number[], spaceIds?: number[], shareIds?: number[]): Promise<FileParseContentPath[]> {
    const hasNoFilters = userIds === undefined && spaceIds === undefined && shareIds === undefined
    const includeUsers = hasNoFilters || !!userIds?.length
    const includeSpaces = hasNoFilters || !!spaceIds?.length
    const includeShares = hasNoFilters || !!shareIds?.length

    const [userPaths, spacePaths, sharePaths] = await Promise.all([
      includeUsers ? this.userPaths(userIds) : [],
      includeSpaces ? this.spacePaths(spaceIds) : [],
      includeShares ? this.sharePaths(shareIds) : []
    ])

    return [...userPaths, ...spacePaths, ...sharePaths]
  }

  private async userPaths(userIds?: number[]): Promise<FileParseContentPath[]> {
    if (userIds?.length === 0) return []
    const paths: FileParseContentPath[] = []
    for (const user of await this.db
      .select({
        id: users.id,
        login: users.login
      })
      .from(users)
      .where(and(...[eq(users.storageIndexing, true), lte(users.role, USER_ROLE.USER), ...(userIds?.length ? [inArray(users.id, userIds)] : [])]))) {
      const userFilesPath = UserModel.getFilesPath(user.login)
      if (!(await isPathExists(userFilesPath))) {
        this.logger.warn({ tag: this.userPaths.name, msg: `user path does not exist : ${userFilesPath}` })
        continue
      }
      paths.push({
        id: user.id,
        type: FILE_REPOSITORY.USER,
        paths: [{ realPath: userFilesPath, pathPrefix: `${SPACE_REPOSITORY.FILES}/${SPACE_ALIAS.PERSONAL}`, isDir: true }]
      })
    }
    return paths
  }

  private async spacePaths(spaceIds?: number[]): Promise<FileParseContentPath[]> {
    if (spaceIds?.length === 0) return []
    const paths: FileParseContentPath[] = []
    for (const space of await this.db
      .select({
        id: spaces.id,
        alias: spaces.alias,
        roots: concatDistinctObjectsInArray(spacesRoots.alias, {
          alias: spacesRoots.alias,
          externalPath: spacesRoots.externalPath,
          isDir: sql<boolean>`IF (${spacesRoots.externalPath} IS NOT NULL, 1, ${files.isDir})`,
          file: {
            path: filePathSQL(files),
            fromOwner: users.login
          }
        })
      })
      .from(spaces)
      .leftJoin(spacesRoots, eq(spacesRoots.spaceId, spaces.id))
      .leftJoin(files, eq(files.id, spacesRoots.fileId))
      .leftJoin(users, eq(users.id, files.ownerId))
      .where(and(eq(spaces.storageIndexing, true), ...(spaceIds?.length ? [inArray(spaces.id, spaceIds)] : [])))
      .groupBy(spaces.id)) {
      const spaceFilesPath = SpaceModel.getFilesPath(space.alias)
      if (!(await isPathExists(spaceFilesPath))) {
        this.logger.warn({ tag: this.spacePaths.name, msg: `space path does not exist : ${spaceFilesPath}` })
        continue
      }
      const spacePath: FileParseContext[] = [{ realPath: spaceFilesPath, pathPrefix: `${SPACE_REPOSITORY.FILES}/${space.alias}`, isDir: true }]
      const rootPaths = space.roots.map(
        (r: any): FileParseContext =>
          r.externalPath
            ? {
                realPath: r.externalPath,
                pathPrefix: `${SPACE_REPOSITORY.FILES}/${space.alias}/${r.alias}`,
                isDir: r.isDir
              }
            : {
                realPath: path.join(UserModel.getFilesPath(r.file.fromOwner), r.file.path),
                pathPrefix: `${SPACE_REPOSITORY.FILES}/${space.alias}/${r.alias}`,
                isDir: r.isDir
              }
      )
      paths.push({ id: space.id, type: FILE_REPOSITORY.SPACE, paths: [...spacePath, ...rootPaths] })
    }
    return paths
  }

  private async sharePaths(shareIds?: number[]): Promise<FileParseContentPath[]> {
    if (shareIds?.length === 0) return []
    const paths: FileParseContentPath[] = []
    for (const share of await this.db
      .select({
        id: shares.id,
        alias: shares.alias,
        externalPath: sql<string>`IF (${shares.externalPath} IS NOT NULL, ${shares.externalPath}, ${spacesRoots.externalPath})`,
        isDir: sql<boolean>`IF (${shares.externalPath} IS NOT NULL AND ${shares.fileId} IS NULL, 1, ${files.isDir})`,
        file: { path: sql<string>`IF (${files.id} IS NOT NULL, ${filePathSQL(files)}, '.')`, fromOwner: users.login, fromSpace: spaces.alias }
      })
      .from(shares)
      .leftJoin(spacesRoots, eq(spacesRoots.id, shares.spaceRootId))
      .leftJoin(
        files,
        or(
          // If the child share is from a share with an external path, the child share should have an external path and a fileId
          and(isNotNull(shares.fileId), eq(files.id, shares.fileId)),
          and(isNull(shares.externalPath), isNull(shares.fileId), isNotNull(spacesRoots.fileId), eq(files.id, spacesRoots.fileId))
        )
      )
      .leftJoin(spaces, and(isNull(shares.externalPath), isNotNull(files.spaceId), eq(spaces.id, files.spaceId), eq(spaces.storageIndexing, true)))
      .leftJoin(users, and(eq(users.id, files.ownerId), eq(users.storageIndexing, true)))
      .where(
        and(eq(shares.storageIndexing, true), ...[eq(shares.type, SHARE_TYPE.COMMON), ...(shareIds?.length ? [inArray(shares.id, shareIds)] : [])])
      )
      .groupBy(shares.id)) {
      let shareFilesPath: string
      if (share.externalPath) {
        shareFilesPath = path.join(share.externalPath, share.file.path)
      } else if (share.file.fromOwner) {
        shareFilesPath = path.join(UserModel.getFilesPath(share.file.fromOwner), share.file.path)
      } else if (share.file.fromSpace) {
        shareFilesPath = path.join(SpaceModel.getFilesPath(share.file.fromSpace), share.file.path)
      } else {
        // Exclude shares that don’t match these cases (join conditions)
        continue
      }
      if (!(await isPathExists(shareFilesPath))) {
        this.logger.warn({ tag: this.sharePaths.name, msg: `share path does not exist : ${shareFilesPath}` })
        continue
      }
      paths.push({
        id: share.id,
        type: FILE_REPOSITORY.SHARE,
        paths: [{ realPath: shareFilesPath, pathPrefix: `${SPACE_REPOSITORY.SHARES}/${share.alias}`, isDir: share.isDir }]
      })
    }
    return paths
  }
}
