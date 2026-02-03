import { HttpException, Injectable, Logger } from '@nestjs/common'
import fs from 'node:fs/promises'
import path from 'node:path'
import { configuration } from '../../../configuration/config.environment'
import { FileDBProps } from '../../files/interfaces/file-db-props.interface'
import { FileLock } from '../../files/interfaces/file-lock.interface'
import { FileProps } from '../../files/interfaces/file-props.interface'
import { FilesLockManager } from '../../files/services/files-lock-manager.service'
import { FilesQueries } from '../../files/services/files-queries.service'
import { FilesRecents } from '../../files/services/files-recents.service'
import { dirName, fileName, getProps } from '../../files/utils/files'
import { SharesQueries } from '../../shares/services/shares-queries.service'
import { USER_PERMISSION } from '../../users/constants/user'
import { UserModel } from '../../users/models/user.model'
import { SpaceFiles } from '../interfaces/space-files.interface'
import { SpaceEnv } from '../models/space-env.model'
import { IsRealPathIsDirAndExists, realPathFromRootFile } from '../utils/paths'
import { SpacesManager } from './spaces-manager.service'
import { SpacesQueries } from './spaces-queries.service'

@Injectable()
export class SpacesBrowser {
  private readonly logger = new Logger(SpacesBrowser.name)

  constructor(
    private readonly spacesManager: SpacesManager,
    private readonly spacesQueries: SpacesQueries,
    private readonly sharesQueries: SharesQueries,
    private readonly filesQueries: FilesQueries,
    private readonly filesLockManager: FilesLockManager,
    private readonly filesRecents: FilesRecents
  ) {}

  async browse(
    user: UserModel,
    space: SpaceEnv,
    options: {
      withLocks?: boolean
      withSpacesAndShares?: boolean
      withSyncs?: boolean
      withHasComments?: boolean
    } = {}
  ): Promise<SpaceFiles> {
    // check sync permission
    options.withSyncs = options.withSyncs && user.havePermission(USER_PERMISSION.DESKTOP_APP) && user.havePermission(USER_PERMISSION.DESKTOP_APP_SYNC)
    const spaceFiles: SpaceFiles = { files: [], hasRoots: false, permissions: space.browsePermissions() }
    const [fsFiles, dbFiles, rootFiles] = await Promise.all([
      this.parseFS(space),
      this.parseDB(user.id, space, options),
      this.parseRootFiles(user, space, {
        withShares: options.withSpacesAndShares,
        withHasComments: options.withHasComments,
        withSyncs: options.withSyncs,
        withLocks: options.withLocks
      })
    ])
    this.updateDBFiles(user, space, dbFiles, fsFiles, options)
    if (space.inSharesList) {
      // the share space includes shares as root files
      spaceFiles.files = [...rootFiles, ...fsFiles]
      spaceFiles.hasRoots = true
    } else {
      await this.mergeSpaceRootFiles(space, rootFiles, fsFiles, spaceFiles)
    }
    if (options.withLocks && !space.inTrashRepository) {
      // locks were removed when files were moved to the trash, no need to parse locks
      await this.enrichWithLocks(space, spaceFiles.files)
    }
    // update recents files
    this.filesRecents.updateRecents(user, space, spaceFiles.files).catch((e: Error) => this.logger.error(`${this.browse.name} - ${e}`))
    return spaceFiles
  }

  private async parseRootFiles(
    user: UserModel,
    space: SpaceEnv,
    options: {
      withShares?: boolean
      withHasComments?: boolean
      withSyncs?: boolean
      withLocks?: boolean
    }
  ): Promise<FileProps[]> {
    if (space.inFilesRepository && space.id && !space.root.alias) {
      // list roots in the space
      return Promise.all((await this.spacesQueries.spaceRootFiles(user.id, space.id, options)).map((f) => this.updateRootFile(f, options)))
    } else if (space.inSharesList) {
      // list shares as roots
      return Promise.all((await this.sharesQueries.shareRootFiles(user, options)).map((f) => this.updateRootFile(f, options)))
    }
    return []
  }

  private async parseDB(
    userId: number,
    space: SpaceEnv,
    options: {
      withSpacesAndShares?: boolean
      withSyncs?: boolean
      withHasComments?: boolean
    }
  ): Promise<FileProps[]> {
    if (space.inSharesList) return []
    const dbOptions = {
      withSpaces: options.withSpacesAndShares && space.inPersonalSpace,
      withShares: options.withSpacesAndShares,
      withSyncs: options.withSyncs,
      withHasComments: options.withHasComments,
      ignoreChildShares: !space.inSharesRepository
    }
    return this.filesQueries.browseFiles(userId, space.dbFile, dbOptions)
  }

  private async parseFS(space: SpaceEnv): Promise<FileProps[]> {
    if (space.inSharesList) return []
    const fsFiles: FileProps[] = []
    try {
      await IsRealPathIsDirAndExists(space.realPath)
    } catch (e) {
      this.logger.warn(`${this.parseFS.name} - ${space.realPath} : ${e.message}`)
      throw new HttpException(e.message, e.httpCode)
    }
    for await (const f of this.parsePath(space)) {
      fsFiles.push(f)
    }
    return fsFiles
  }

  private async *parsePath(space: SpaceEnv): AsyncGenerator<FileProps> {
    try {
      for (const element of await fs.readdir(space.realPath, { withFileTypes: true })) {
        const isDir = element.isDirectory()
        if (!isDir && !element.isFile()) {
          this.logger.log(`${this.parsePath.name} - ignore special file : ${element.name}`)
          continue
        }
        if (!configuration.applications.files.showHiddenFiles && element.name[0] === '.') {
          this.logger.verbose(`${this.parsePath.name} - ignore filtered file : ${element.name}`)
          continue
        }
        const realPath = path.join(space.realPath, element.name)
        const filePath = path.join(space.relativeUrl, element.name)
        try {
          yield await getProps(realPath, filePath, isDir)
        } catch (e) {
          this.logger.warn(`${this.parsePath.name} - unable get stats from ${realPath} : ${e}`)
        }
      }
    } catch (e) {
      this.logger.error(`${this.parsePath.name} - unable to parse ${space.realPath} : ${e}`)
    }
  }

  private async updateRootFile(
    f: FileProps,
    options: { withShares?: boolean; withHasComments?: boolean; withSyncs?: boolean; withLocks?: boolean }
  ): Promise<FileProps> {
    const realPath = realPathFromRootFile(f)
    const originalPath = f.path
    f.path = f.root.name
    try {
      const fileProps: FileProps = await getProps(realPath, f.path)
      if (options.withShares) {
        fileProps.shares = f.shares
      }
      if (options.withHasComments) {
        fileProps.hasComments = f.hasComments
      }
      if (options.withSyncs) {
        fileProps.syncs = f.syncs
      }
      if (options.withLocks && (f.origin || f.root?.owner)) {
        // `f.origin` is used for shares
        // `f.root.owner` is used for anchored files in spaces
        // all other files are handled in the `enrichWithLocks` function
        const dbFile: FileDBProps = {
          ...(f.origin?.spaceId
            ? { spaceId: f.origin.spaceId, ...(f.origin.spaceExternalRootId ? { spaceExternalRootId: f.origin.spaceExternalRootId } : {}) }
            : f.origin?.shareExternalId
              ? { shareExternalId: f.origin.shareExternalId }
              : { ownerId: f.origin?.ownerId ?? f.root.owner.id }),
          path: originalPath,
          inTrash: f.inTrash
        }
        const locks = await this.filesLockManager.getLocksByPath(dbFile)
        if (locks.length > 0) {
          fileProps.lock = this.filesLockManager.convertLockToFileLockProps(locks[0])
        }
      }
      // `owner.id` is only used in the `withLocks` condition
      delete f.root.owner?.id
      // check `f.id`; it can be null for external roots
      if (f.id) {
        // todo: check if a db file referenced under external roots have an id and correctly parsed here
        this.filesQueries.compareAndUpdateFileProps(f, fileProps).catch((e: Error) => this.logger.error(`${this.updateRootFile.name} - ${e}`))
        fileProps.id = f.id
      }
      fileProps.root = {
        id: f.root.id,
        alias: f.root.alias,
        description: f.root.description,
        enabled: typeof f.root.enabled === 'undefined' ? true : f.root.enabled,
        permissions: f.root.permissions,
        owner: f.root.owner
      }
      return fileProps
    } catch (e) {
      this.logger.error(`${this.updateRootFile.name} - ${JSON.stringify(f)} - ${e}`)
      return { ...f, name: fileName(f.path), path: dirName(f.path), ...{ root: { ...f.root, enabled: false } } }
    }
  }

  private updateDBFiles(
    user: UserModel,
    space: SpaceEnv,
    dbFiles: FileProps[],
    fsFiles: FileProps[],
    options: {
      withSpacesAndShares?: boolean
      withSyncs?: boolean
      withHasComments?: boolean
    }
  ) {
    for (const dbFile of dbFiles) {
      const fsFile = fsFiles.find((f: FileProps) => dbFile.name === f.name)
      if (fsFile) {
        /* important: inherits from the file id in database */
        fsFile.id = dbFile.id
        if (options.withSpacesAndShares) {
          fsFile.spaces = dbFile.spaces
          fsFile.shares = dbFile.shares
        }
        if (options.withSyncs) {
          fsFile.syncs = dbFile.syncs
        }
        if (options.withHasComments) {
          fsFile.hasComments = dbFile.hasComments
        }
        this.filesQueries.compareAndUpdateFileProps(dbFile, fsFile).catch((e: Error) => this.logger.error(`${this.updateDBFiles.name} - ${e}`))
      } else {
        this.logger.warn(`${this.updateDBFiles.name} - missing ${dbFile.path}/${dbFile.name} (${dbFile.id}) from fs, delete it from db`)
        if (options.withSpacesAndShares) {
          if (dbFile.spaces) {
            for (const space of dbFile.spaces) {
              this.logger.warn(
                `${this.updateDBFiles.name} - ${dbFile.path}/${dbFile.name} (${dbFile.id}) will be removed from space : *${space.alias}* (${space.id})`
              )
            }
          }
          if (dbFile.shares) {
            for (const share of dbFile.shares) {
              this.logger.warn(
                `${this.updateDBFiles.name} - ${dbFile.path}/${dbFile.name} (${dbFile.id}) will be removed from share : *${share.alias}* (${share.id})`
              )
            }
          }
        }
        this.deleteDBFile(user, space, dbFile).catch((e: Error) => this.logger.error(`${this.updateDBFiles.name} - ${e}`))
      }
    }
  }

  private async deleteDBFile(user: UserModel, space: SpaceEnv, dbFile: FileProps) {
    const spaceEnv = await this.spacesManager.spaceEnv(user, path.join(space.url, dbFile.name).split('/'))
    this.filesQueries.deleteFiles(spaceEnv.dbFile, dbFile.isDir, true).catch((e: Error) => this.logger.error(`${this.deleteDBFile.name} - ${e}`))
  }

  private async mergeSpaceRootFiles(space: SpaceEnv, rootFiles: FileProps[], fsFiles: FileProps[], spaceFiles: SpaceFiles) {
    // merges root files in space files taking care of alias and name (file names must be unique)
    if (!rootFiles.length) {
      spaceFiles.files = fsFiles
      return
    }
    spaceFiles.hasRoots = true
    for (const f of rootFiles) {
      // check root alias (must be unique in the space)
      const newAlias: string = await this.spacesManager.uniqueRootAlias(
        space.id,
        f.root.alias,
        fsFiles.map((f) => f.name),
        true
      )
      if (newAlias) {
        this.logger.log(`${this.mergeSpaceRootFiles.name} - update space root alias (${f.root.id}) : ${f.root.alias} -> ${newAlias}`)
        // update in db
        this.spacesQueries
          .updateRoot({ alias: newAlias }, { id: f.root.id })
          .catch((e: Error) => this.logger.error(`${this.mergeSpaceRootFiles.name} - ${e}`))
        // cleanup cache
        this.spacesQueries
          .clearCachePermissions(space.alias, [f.root.alias, newAlias])
          .catch((e: Error) => this.logger.error(`${this.mergeSpaceRootFiles.name} - ${e}`))
        // assign
        f.root.alias = newAlias
      }
      // check root name (must be unique in the space)
      // f.name is equal to root name
      const newName: string = this.spacesManager.uniqueRootName(
        f.name,
        fsFiles.map((f) => f.name)
      )
      if (newName) {
        this.logger.log(`${this.mergeSpaceRootFiles.name} - update space root name (${f.root.id}) : ${f.name} -> ${newName}`)
        // update in db
        this.spacesQueries
          .updateRoot({ name: newName }, { id: f.root.id })
          .catch((e: Error) => this.logger.error(`${this.mergeSpaceRootFiles.name} - ${e}`))
        // assign
        f.name = newName
      }
    }
    spaceFiles.files = [...fsFiles, ...rootFiles]
  }

  private async enrichWithLocks(space: SpaceEnv, files: FileProps[]) {
    if (space.inSharesList) {
      return
    }
    const locks: Record<string, FileLock> = await this.filesLockManager.browseParentChildLocks(space.dbFile, false)
    if (!Object.keys(locks).length) return
    for (const f of files.filter((f) => !f.root && !f.origin && f.name in locks)) {
      f.lock = this.filesLockManager.convertLockToFileLockProps(locks[f.name])
    }
  }
}
