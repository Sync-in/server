import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import fs from 'node:fs/promises'
import path from 'node:path'
import { toErrorMessage } from '../../../common/errors.js'
import { FileDBProps } from '../../files/interfaces/file-db-props.interface.js'
import { FileLock } from '../../files/interfaces/file-lock.interface.js'
import { FileProps } from '../../files/interfaces/file-props.interface.js'
import { FilesLockManager } from '../../files/services/files-lock-manager.service.js'
import { FilesQueries } from '../../files/services/files-queries.service.js'
import { FilesRecents } from '../../files/services/files-recents.service.js'
import { FileError } from '../../files/models/file-error.js'
import { dirName, fileName, getProps, isInternalTemporaryEntry } from '../../files/utils/files.js'
import { SharesQueries } from '../../shares/services/shares-queries.service.js'
import { UserModel } from '../../users/models/user.model.js'
import { SpaceBrowseDetails, SpaceFiles } from '../interfaces/space-files.interface.js'
import { SpaceEnv } from '../models/space-env.model.js'
import { IsRealPathIsDirAndExists, realPathFromRootFile } from '../utils/paths.js'
import { SpacesManager } from './spaces-manager.service.js'
import { SpacesQueries } from './spaces-queries.service.js'

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

  async browse(user: UserModel, space: SpaceEnv, withDetails = false, includeHidden = false): Promise<SpaceFiles> {
    const details: SpaceBrowseDetails = withDetails
      ? {
          syncs: user.isUser,
          favorites: !user.isLink
        }
      : null
    const spaceFiles: SpaceFiles = {
      space: { alias: space.alias, name: space.name },
      files: [],
      hasRoots: false,
      permissions: space.browsePermissions()
    }
    const [fsFiles, dbFiles, rootFiles] = await Promise.all([
      this.parseFS(space),
      this.parseDB(user.id, space, details),
      this.parseRootFiles(user, space, details)
    ])
    this.updateDBFiles(user, space, dbFiles, fsFiles, details)
    const showHiddenFiles = user.preferences.showHiddenFiles || includeHidden
    const visibleFSFiles = showHiddenFiles ? fsFiles : fsFiles.filter((file) => !file.name.startsWith('.'))
    const visibleRootFiles = rootFiles.filter((file) => !isInternalTemporaryEntry(file.name) && (showHiddenFiles || !file.name.startsWith('.')))
    if (space.inSharesList) {
      // the share space includes shares as root files
      spaceFiles.files = [...visibleRootFiles, ...visibleFSFiles]
      spaceFiles.hasRoots = true
    } else {
      await this.mergeSpaceRootFiles(space, visibleRootFiles, visibleFSFiles, spaceFiles)
    }
    if (details && !space.inTrashRepository) {
      // locks were removed when files were moved to the trash, no need to parse locks
      await this.enrichWithLocks(space, spaceFiles.files)
    }
    // A forced hidden-file lookup may expose entries outside the user's preference and must not update their recents snapshot.
    if (user.preferences.showHiddenFiles || !includeHidden) {
      this.filesRecents
        .updateRecents(user, space, spaceFiles.files)
        .catch((e: Error) => this.logger.error({ tag: this.browse.name, msg: toErrorMessage(e) }))
    }
    return spaceFiles
  }

  private async parseRootFiles(user: UserModel, space: SpaceEnv, details: SpaceBrowseDetails): Promise<FileProps[]> {
    if (space.inFilesRepository && space.id && !space.root!.alias) {
      // list roots in the space
      return Promise.all((await this.spacesQueries.spaceRootFiles(user.id, space.id, details)).map((f) => this.updateRootFile(f, details)))
    } else if (space.inSharesList) {
      // list shares as roots
      return Promise.all((await this.sharesQueries.shareRootFiles(user, details)).map((f) => this.updateRootFile(f, details)))
    }
    return []
  }

  private async parseDB(userId: number, space: SpaceEnv, details: SpaceBrowseDetails): Promise<FileProps[]> {
    if (space.inSharesList) return []
    return this.filesQueries.browseFiles(userId, space, details)
  }

  private async parseFS(space: SpaceEnv): Promise<FileProps[]> {
    if (space.inSharesList) return []
    const fsFiles: FileProps[] = []
    try {
      await IsRealPathIsDirAndExists(space.realPath)
    } catch (e) {
      const message = toErrorMessage(e)
      this.logger.warn({ tag: this.parseFS.name, msg: `${space.realPath} : ${message}` })
      throw new HttpException(message, e instanceof FileError ? e.httpCode : HttpStatus.INTERNAL_SERVER_ERROR)
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
        if (isInternalTemporaryEntry(element.name)) {
          this.logger.verbose({ tag: this.parsePath.name, msg: `ignore internal temporary entry : ${element.name}` })
          continue
        }
        if (!isDir && !element.isFile()) {
          this.logger.log({ tag: this.parsePath.name, msg: `ignore special file : ${element.name}` })
          continue
        }
        const realPath = path.join(space.realPath, element.name)
        const filePath = path.join(space.relativeUrl, element.name)
        try {
          yield await getProps(realPath, filePath, isDir)
        } catch (e) {
          this.logger.warn({ tag: this.parsePath.name, msg: `unable get stats from ${realPath} : ${toErrorMessage(e)}` })
        }
      }
    } catch (e) {
      this.logger.error({ tag: this.parsePath.name, msg: `unable to parse ${space.realPath} : ${toErrorMessage(e)}` })
    }
  }

  private async updateRootFile(f: FileProps, details: SpaceBrowseDetails): Promise<FileProps> {
    const originalPath = f.path
    try {
      const realPath = realPathFromRootFile(f)
      const root = f.root
      if (!realPath || !root?.name) {
        throw new Error('Root file path not found')
      }
      f.path = root.name
      const fileProps: FileProps = await getProps(realPath, f.path)
      if (details) {
        fileProps.shares = f.shares
        fileProps.hasComments = f.hasComments
      }
      if (details?.favorites) {
        fileProps.isFavorite = f.isFavorite
      }
      if (details?.syncs) {
        fileProps.syncs = f.syncs
      }
      if (details && (f.origin || root.owner)) {
        // `f.origin` is used for shares
        // `f.root.owner` is used for anchored files in spaces
        // all other files are handled in the `enrichWithLocks` function
        const dbFile: FileDBProps = {
          ...(f.origin?.spaceId
            ? { spaceId: f.origin.spaceId, ...(f.origin.spaceExternalRootId ? { spaceExternalRootId: f.origin.spaceExternalRootId } : {}) }
            : f.origin?.shareExternalId
              ? { shareExternalId: f.origin.shareExternalId }
              : { ownerId: f.origin?.ownerId ?? root.owner.id }),
          path: originalPath,
          inTrash: f.inTrash ?? false
        }
        const locks = await this.filesLockManager.getLocksByPath(dbFile)
        if (locks.length > 0) {
          fileProps.lock = this.filesLockManager.convertLockToFileLockProps(locks[0])
        }
      }
      // `owner.id` is only used for lock details
      delete root.owner.id
      // check `f.id`; it can be null for external roots
      if (f.id) {
        // todo: check if a db file referenced under external roots have an id and correctly parsed here
        this.filesQueries
          .compareAndUpdateFileProps(f, fileProps)
          .catch((e: Error) => this.logger.error({ tag: this.updateRootFile.name, msg: toErrorMessage(e) }))
        fileProps.id = f.id
      }
      fileProps.root = {
        id: root.id,
        alias: root.alias,
        description: root.description,
        enabled: root.enabled ?? true,
        permissions: root.permissions,
        owner: root.owner
      }
      return fileProps
    } catch (e) {
      this.logger.error({ tag: this.updateRootFile.name, msg: `${JSON.stringify(f)} - ${toErrorMessage(e)}` })
      return { ...f, name: fileName(f.path), path: dirName(f.path), root: { ...f.root, enabled: false } } as FileProps
    }
  }

  private updateDBFiles(user: UserModel, space: SpaceEnv, dbFiles: FileProps[], fsFiles: FileProps[], details: SpaceBrowseDetails) {
    for (const dbFile of dbFiles) {
      if (isInternalTemporaryEntry(dbFile.name)) continue
      const fsFile = fsFiles.find((f: FileProps) => dbFile.name === f.name)
      if (fsFile) {
        /* important: inherits from the file id in database */
        fsFile.id = dbFile.id
        if (details) {
          fsFile.spaces = dbFile.spaces
          fsFile.shares = dbFile.shares
          fsFile.hasComments = dbFile.hasComments
        }
        if (details?.syncs) {
          fsFile.syncs = dbFile.syncs
        }
        if (details?.favorites) {
          fsFile.isFavorite = dbFile.isFavorite
        }
        this.filesQueries
          .compareAndUpdateFileProps(dbFile, fsFile)
          .catch((e: Error) => this.logger.error({ tag: this.updateDBFiles.name, msg: toErrorMessage(e) }))
      } else {
        this.logger.warn({ tag: this.updateDBFiles.name, msg: `missing ${dbFile.path}/${dbFile.name} (${dbFile.id}) from fs, delete it from db` })
        if (details) {
          if (dbFile.spaces) {
            for (const space of dbFile.spaces) {
              this.logger.warn({
                tag: this.updateDBFiles.name,
                msg: `${dbFile.path}/${dbFile.name} (${dbFile.id}) will be removed from space : *${space.alias}* (${space.id})`
              })
            }
          }
          if (dbFile.shares) {
            for (const share of dbFile.shares) {
              this.logger.warn({
                tag: this.updateDBFiles.name,
                msg: `${dbFile.path}/${dbFile.name} (${dbFile.id}) will be removed from share : *${share.alias}* (${share.id})`
              })
            }
          }
        }
        this.deleteDBFile(user, space, dbFile).catch((e: Error) => this.logger.error({ tag: this.updateDBFiles.name, msg: toErrorMessage(e) }))
      }
    }
  }

  private async deleteDBFile(user: UserModel, space: SpaceEnv, dbFile: FileProps) {
    const spaceEnv = await this.spacesManager.spaceEnv(user, path.join(space.url, dbFile.name).split('/'))
    this.filesQueries
      .deleteFiles(spaceEnv!.dbFile, dbFile.isDir, true)
      .catch((e: Error) => this.logger.error({ tag: this.deleteDBFile.name, msg: toErrorMessage(e) }))
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
      const newAlias = await this.spacesManager.uniqueRootAlias(
        space.id,
        f.root!.alias,
        fsFiles.map((f) => f.name),
        true,
        f.root!.id
      )
      if (newAlias) {
        this.logger.log({ tag: this.mergeSpaceRootFiles.name, msg: `update space root alias (${f.root!.id}) : ${f.root!.alias} -> ${newAlias}` })
        // update in db
        this.spacesQueries
          .updateRoot({ alias: newAlias }, { id: f.root!.id })
          .catch((e: Error) => this.logger.error({ tag: this.mergeSpaceRootFiles.name, msg: toErrorMessage(e) }))
        // cleanup cache
        this.spacesQueries
          .clearCachePermissions(space.alias, [f.root!.alias, newAlias])
          .catch((e: Error) => this.logger.error({ tag: this.mergeSpaceRootFiles.name, msg: toErrorMessage(e) }))
        // assign
        f.root!.alias = newAlias
      }
      // check root name (must be unique in the space)
      // f.name is equal to root name
      const newName = this.spacesManager.uniqueRootName(
        f.name,
        fsFiles.map((f) => f.name)
      )
      if (newName) {
        this.logger.log({ tag: this.mergeSpaceRootFiles.name, msg: `update space root name (${f.root!.id}) : ${f.name} -> ${newName}` })
        // update in db
        this.spacesQueries
          .updateRoot({ name: newName }, { id: f.root!.id })
          .catch((e: Error) => this.logger.error({ tag: this.mergeSpaceRootFiles.name, msg: toErrorMessage(e) }))
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
