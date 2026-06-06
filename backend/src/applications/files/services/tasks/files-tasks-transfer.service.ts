import { Injectable } from '@nestjs/common'
import { createReadStream, createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { UserModel } from '../../../users/models/user.model'
import { SpaceEnv } from '../../../spaces/models/space-env.model'
import { DEFAULT_HIGH_WATER_MARK } from '../../constants/files'
import { FILE_OPERATION } from '../../constants/operations'
import { FileTaskEvent } from '../../events/file-events'
import { fileSize, isPathExists, moveFiles, removeFiles } from '../../utils/files'
import { countDirEntriesAndSize, isCrossDeviceMove, taskTemporaryPath } from '../../utils/tasks'
import { FileTaskCopyTaskOptions, FileTaskTransferOptions } from '../../interfaces/file-task.interface'
import { SourceCleanupError } from '../../models/file-error'

@Injectable()
export class FilesTasksTransfer {
  async copy(
    user: UserModel,
    srcSpace: SpaceEnv,
    dstSpace: SpaceEnv,
    overwrite: boolean,
    recursive: boolean,
    isDir: boolean,
    signal: AbortSignal,
    deleteDestination: () => Promise<void>
  ): Promise<void> {
    await this.initializeTaskProps(srcSpace, isDir)
    await this.copyAbortable(srcSpace.realPath, dstSpace.realPath, {
      beforeCommit: this.prepareTaskDestination(srcSpace, dstSpace, overwrite, deleteDestination),
      cacheKey: srcSpace.task!.cacheKey,
      onProgress: (bytes) => this.updateProgress(srcSpace, bytes),
      onTransferStart: (watchPath) => this.startTransferTaskWatch(srcSpace, FILE_OPERATION.COPY, dstSpace.realPath, watchPath),
      overwrite,
      recursive,
      signal,
      stagingDir: user.tasksPath
    })
  }

  async move(
    user: UserModel,
    srcSpace: SpaceEnv,
    dstSpace: SpaceEnv,
    overwrite: boolean,
    isDir: boolean,
    signal: AbortSignal | undefined,
    deleteDestination: () => Promise<void>
  ): Promise<SourceCleanupError | undefined> {
    await this.initializeTaskProps(srcSpace, isDir)
    const beforeCommit = this.prepareTaskDestination(srcSpace, dstSpace, overwrite, deleteDestination)
    if (!signal) {
      // Same-device moves stay atomic and do not copy bytes.
      this.startTransferTaskWatch(srcSpace, FILE_OPERATION.MOVE, dstSpace.realPath)
      await beforeCommit?.()
      await moveFiles(srcSpace.realPath, dstSpace.realPath, overwrite)
      return
    }
    return this.moveAbortable(srcSpace.realPath, dstSpace.realPath, {
      beforeCommit,
      cacheKey: srcSpace.task!.cacheKey,
      crossDevice: true,
      onProgress: (bytes) => this.updateProgress(srcSpace, bytes),
      onTransferStart: (watchPath) => this.startTransferTaskWatch(srcSpace, FILE_OPERATION.MOVE, dstSpace.realPath, watchPath),
      overwrite,
      signal,
      stagingDir: user.tasksPath
    })
  }

  async delete(
    user: UserModel,
    space: SpaceEnv,
    trashFile: string,
    isDir: boolean,
    signal: AbortSignal | undefined,
    prepareDestination: () => Promise<void>
  ): Promise<SourceCleanupError | undefined> {
    await this.initializeTaskProps(space, isDir)
    if (!signal) {
      // Moving to trash on the same device stays atomic and does not copy bytes.
      this.startTransferTaskWatch(space, FILE_OPERATION.DELETE, trashFile)
      await prepareDestination()
      await moveFiles(space.realPath, trashFile, true)
      return
    }
    return this.moveAbortable(space.realPath, trashFile, {
      beforeCommit: prepareDestination,
      cacheKey: space.task!.cacheKey,
      crossDevice: true,
      onProgress: (bytes) => this.updateProgress(space, bytes),
      onTransferStart: (watchPath) => this.startTransferTaskWatch(space, FILE_OPERATION.DELETE, trashFile, watchPath),
      overwrite: true,
      signal,
      stagingDir: user.tasksPath
    })
  }

  private async initializeTaskProps(space: SpaceEnv, isDir: boolean): Promise<void> {
    const metrics = isDir ? await countDirEntriesAndSize(space.realPath) : { size: await fileSize(space.realPath) }
    space.task!.props = {
      ...space.task!.props,
      ...metrics,
      progress: 1,
      size: 0,
      totalSize: metrics.size
    }
  }

  private updateProgress(space: SpaceEnv, bytes: number): void {
    const props = space.task!.props
    props.size = Math.min((props.size || 0) + bytes, props.totalSize || Number.MAX_SAFE_INTEGER)
    if (props.totalSize) {
      props.progress = Math.min((100 * props.size) / props.totalSize, 100)
    }
  }

  private prepareTaskDestination(
    srcSpace: SpaceEnv,
    dstSpace: SpaceEnv,
    overwrite: boolean,
    deleteDestination: () => Promise<void>
  ): (() => Promise<void>) | undefined {
    if (!overwrite || srcSpace.realPath.toLowerCase() === dstSpace.realPath.toLowerCase()) return
    return async () => {
      if (await isPathExists(dstSpace.realPath)) {
        await deleteDestination()
      }
    }
  }

  private startTransferTaskWatch(space: SpaceEnv, operation: FILE_OPERATION, publishedPath: string, watchPath?: string): void {
    FileTaskEvent.emit('startWatch', space, operation, publishedPath, watchPath)
  }

  private async copyAbortable(srcPath: string, dstPath: string, options: FileTaskCopyTaskOptions): Promise<void> {
    const {
      beforeCommit,
      cacheKey,
      onProgress,
      onTransferStart,
      overwrite = false,
      preserveTimestamps = true,
      recursive = true,
      signal,
      stagingDir = path.dirname(dstPath)
    } = options
    const temporaryPath = taskTemporaryPath(stagingDir, cacheKey, dstPath)
    await fs.mkdir(stagingDir, { recursive: true })
    const copyDirectlyToDestination = await isCrossDeviceMove(stagingDir, dstPath)

    if (copyDirectlyToDestination) {
      let transferStarted = false
      try {
        signal.throwIfAborted()
        await beforeCommit?.()
        signal.throwIfAborted()
        await this.prepareDestination(dstPath, overwrite)
        onTransferStart?.(dstPath)
        transferStarted = true
        await this.copyEntry(srcPath, dstPath, recursive, preserveTimestamps, signal, onProgress)
      } catch (e) {
        if (transferStarted) {
          await this.cleanupAfterFailure(dstPath)
        }
        throw e
      }
      return
    }

    try {
      onTransferStart?.(temporaryPath)
      await this.copyEntry(srcPath, temporaryPath, recursive, preserveTimestamps, signal, onProgress)
      signal.throwIfAborted()
      await beforeCommit?.()
      await this.prepareDestination(dstPath, overwrite)
      await fs.rename(temporaryPath, dstPath)
    } catch (e) {
      await this.cleanupAfterFailure(temporaryPath)
      throw e
    }
  }

  private async moveAbortable(srcPath: string, dstPath: string, options: FileTaskTransferOptions): Promise<SourceCleanupError | undefined> {
    const { beforeCommit, cacheKey, onProgress, onTransferStart, overwrite = false, signal, stagingDir } = options
    const crossDevice = options.crossDevice ?? (await isCrossDeviceMove(srcPath, dstPath))
    if (!crossDevice) {
      signal.throwIfAborted()
      await beforeCommit?.()
      await moveFiles(srcPath, dstPath, overwrite)
      return
    }
    await this.copyAbortable(srcPath, dstPath, { beforeCommit, cacheKey, onProgress, onTransferStart, overwrite, signal, stagingDir })
    try {
      await removeFiles(srcPath)
    } catch (cause) {
      return new SourceCleanupError(srcPath, dstPath, { cause })
    }
  }

  private async copyEntry(
    srcPath: string,
    dstPath: string,
    recursive: boolean,
    preserveTimestamps: boolean,
    signal: AbortSignal,
    onProgress?: (bytes: number) => void
  ): Promise<void> {
    signal.throwIfAborted()
    const stats = await fs.lstat(srcPath)
    if (stats.isDirectory()) {
      await fs.mkdir(dstPath)
      if (recursive) {
        for (const entry of await fs.readdir(srcPath)) {
          await this.copyEntry(path.join(srcPath, entry), path.join(dstPath, entry), true, preserveTimestamps, signal, onProgress)
        }
      }
    } else if (stats.isSymbolicLink()) {
      await fs.symlink(await fs.readlink(srcPath), dstPath)
    } else {
      const src = createReadStream(srcPath, { highWaterMark: DEFAULT_HIGH_WATER_MARK })
      const dst = createWriteStream(dstPath, { mode: stats.mode, highWaterMark: DEFAULT_HIGH_WATER_MARK })
      if (onProgress) {
        const progress = new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            onProgress(chunk.length)
            callback(null, chunk)
          }
        })
        await pipeline(src, progress, dst, { signal })
      } else {
        await pipeline(src, dst, { signal })
      }
    }
    if (!stats.isSymbolicLink()) {
      await fs.chmod(dstPath, stats.mode)
      if (preserveTimestamps) {
        await fs.utimes(dstPath, stats.atime, stats.mtime)
      }
    }
  }

  private async prepareDestination(dstPath: string, overwrite: boolean): Promise<void> {
    if (!(await isPathExists(dstPath))) return
    if (!overwrite) {
      throw Object.assign(new Error('Destination already exists'), { code: 'EEXIST' })
    }
    await removeFiles(dstPath)
  }

  private async cleanupAfterFailure(rPath: string): Promise<void> {
    try {
      await removeFiles(rPath)
    } catch {
      // Cleanup is best-effort and must not replace the transfer error.
    }
  }
}
