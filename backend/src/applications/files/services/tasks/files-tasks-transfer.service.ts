import { Injectable } from '@nestjs/common'
import { createReadStream, createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { UserModel } from '../../../users/models/user.model'
import { SpaceEnv } from '../../../spaces/models/space-env.model'
import { temporaryRootFromSpace } from '../../../spaces/utils/paths'
import { DEFAULT_HIGH_WATER_MARK } from '../../constants/files'
import { FILE_OPERATION } from '../../constants/operations'
import { FileTaskEvent } from '../../events/file-events'
import type { FileTaskCopyTaskOptions, FileTaskExtractionEntry, FileTaskTransferOptions } from '../../interfaces/file-task.interface'
import {
  createProgressTransform,
  fileSize,
  isCrossDevice,
  isInternalTemporaryEntry,
  isPathExists,
  removeFiles,
  temporaryFilePath
} from '../../utils/files'
import { countDirEntriesAndSize, isCrossDeviceError } from '../../utils/tasks'
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
      executionId: srcSpace.task!.id,
      onProgress: this.createByteProgressHandler(srcSpace),
      onTransferStart: () => this.startTransferTaskWatch(srcSpace, dstSpace.realPath),
      operation: FILE_OPERATION.COPY,
      overwrite,
      recursive,
      signal,
      stagingDir: temporaryRootFromSpace(user, dstSpace)
    })
  }

  async move(
    user: UserModel,
    srcSpace: SpaceEnv,
    dstSpace: SpaceEnv,
    overwrite: boolean,
    isDir: boolean,
    signal: AbortSignal,
    deleteDestination: () => Promise<void>
  ): Promise<SourceCleanupError | undefined> {
    const beforeCommit = this.prepareTaskDestination(srcSpace, dstSpace, overwrite, deleteDestination)
    return this.moveAbortable(srcSpace.realPath, dstSpace.realPath, {
      beforeCommit,
      beforeTransfer: () => this.initializeTaskProps(srcSpace, isDir),
      executionId: srcSpace.task!.id,
      onProgress: this.createByteProgressHandler(srcSpace),
      onTransferStart: () => this.startTransferTaskWatch(srcSpace, dstSpace.realPath),
      operation: FILE_OPERATION.MOVE,
      overwrite,
      signal,
      stagingDir: temporaryRootFromSpace(user, dstSpace)
    })
  }

  async delete(
    space: SpaceEnv,
    trashFile: string,
    stagingDir: string,
    isDir: boolean,
    signal: AbortSignal | undefined,
    prepareDestination: () => Promise<void>
  ): Promise<SourceCleanupError | undefined> {
    return this.moveAbortable(space.realPath, trashFile, {
      beforeCommit: prepareDestination,
      beforeTransfer: () => this.initializeTaskProps(space, isDir),
      executionId: space.task!.id,
      onProgress: this.createByteProgressHandler(space),
      onTransferStart: () => this.startTransferTaskWatch(space, trashFile),
      operation: FILE_OPERATION.DELETE,
      overwrite: true,
      signal: signal ?? new AbortController().signal,
      stagingDir
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

  createByteProgressHandler(space: SpaceEnv): (bytes: number) => void {
    return (bytes) => {
      const props = space.task!.props
      props.size = Math.min((props.size ?? 0) + bytes, props.totalSize ?? Number.MAX_SAFE_INTEGER)
      if (props.totalSize) {
        props.progress = Math.min((100 * props.size) / props.totalSize, 100)
      }
    }
  }

  createExtractionProgressHandler(space: SpaceEnv): (entry: FileTaskExtractionEntry) => void {
    const directories = new Set<string>()
    const files = new Map<string, number>()
    space.task!.props = { ...space.task!.props, files: 0, directories: 0, size: 0 }
    return (entry) => {
      const parts = entry.path.split(/[/\\]/).filter((part) => part && part !== '.')
      const directoryParts = entry.isDirectory ? parts : parts.slice(0, -1)
      for (let index = 1; index <= directoryParts.length; index++) {
        directories.add(directoryParts.slice(0, index).join('/'))
      }
      const props = space.task!.props
      props.directories = directories.size
      if (!entry.isDirectory && parts.length) {
        const filePath = parts.join('/')
        const previousSize = files.get(filePath) ?? 0
        files.set(filePath, entry.size)
        props.files = files.size
        props.size = (props.size ?? 0) - previousSize + entry.size
      }
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

  private startTransferTaskWatch(space: SpaceEnv, publishedPath: string): void {
    FileTaskEvent.emit('startWatch', space, publishedPath)
  }

  private async copyAbortable(srcPath: string, dstPath: string, options: FileTaskCopyTaskOptions): Promise<void> {
    const {
      beforeCommit,
      executionId,
      onProgress,
      onTransferStart,
      operation,
      overwrite = false,
      preserveTimestamps = true,
      recursive = true,
      signal,
      stagingDir = path.dirname(dstPath)
    } = options
    const temporaryPath = temporaryFilePath(stagingDir, dstPath, operation, executionId)
    await fs.mkdir(stagingDir, { recursive: true })
    const copyDirectlyToDestination = await isCrossDevice(stagingDir, dstPath)

    if (copyDirectlyToDestination) {
      let transferStarted = false
      try {
        signal.throwIfAborted()
        await beforeCommit?.()
        signal.throwIfAborted()
        await this.prepareDestination(dstPath, overwrite)
        onTransferStart?.()
        transferStarted = true
        await this.copyEntry(srcPath, dstPath, recursive, preserveTimestamps, signal, onProgress)
      } catch (e) {
        if (transferStarted) {
          await this.removeBestEffort(dstPath)
        }
        throw e
      }
      return
    }

    try {
      onTransferStart?.()
      await this.copyEntry(srcPath, temporaryPath, recursive, preserveTimestamps, signal, onProgress)
      signal.throwIfAborted()
      await beforeCommit?.()
      await this.prepareDestination(dstPath, overwrite)
      await this.publishTemporaryEntry(temporaryPath, dstPath, recursive, preserveTimestamps, signal)
    } catch (e) {
      await this.removeBestEffort(temporaryPath)
      throw e
    }
  }

  private async moveAbortable(srcPath: string, dstPath: string, options: FileTaskTransferOptions): Promise<SourceCleanupError | undefined> {
    const { beforeCommit, beforeTransfer, executionId, onProgress, onTransferStart, operation, overwrite = false, signal, stagingDir } = options
    const crossDevice = await isCrossDevice(srcPath, dstPath)
    let streamedBeforeCommit = beforeCommit
    if (!crossDevice) {
      signal.throwIfAborted()
      await beforeCommit?.()
      streamedBeforeCommit = undefined
      if (!overwrite && srcPath.toLowerCase() !== dstPath.toLowerCase() && (await isPathExists(dstPath))) {
        throw this.destinationExistsError()
      }
      if (await this.tryRename(srcPath, dstPath)) return
    }
    signal.throwIfAborted()
    await beforeTransfer?.()
    await this.copyAbortable(srcPath, dstPath, {
      beforeCommit: streamedBeforeCommit,
      executionId,
      onProgress,
      onTransferStart,
      operation,
      overwrite,
      signal,
      stagingDir
    })
    try {
      await removeFiles(srcPath)
    } catch (cause) {
      return new SourceCleanupError(srcPath, dstPath, { cause })
    }
  }

  private async publishTemporaryEntry(
    temporaryPath: string,
    dstPath: string,
    recursive: boolean,
    preserveTimestamps: boolean,
    signal: AbortSignal
  ): Promise<void> {
    if (await this.tryRename(temporaryPath, dstPath)) return
    try {
      // Bytes were already accounted for while filling the staging entry.
      await this.copyEntry(temporaryPath, dstPath, recursive, preserveTimestamps, signal)
    } catch (error) {
      await this.removeBestEffort(dstPath)
      throw error
    }
    await this.removeBestEffort(temporaryPath)
  }

  private async tryRename(srcPath: string, dstPath: string): Promise<boolean> {
    try {
      await fs.rename(srcPath, dstPath)
      return true
    } catch (error) {
      if (isCrossDeviceError(error)) return false
      throw error
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
          if (isInternalTemporaryEntry(entry)) continue
          await this.copyEntry(path.join(srcPath, entry), path.join(dstPath, entry), true, preserveTimestamps, signal, onProgress)
        }
      }
    } else if (stats.isSymbolicLink()) {
      await fs.symlink(await fs.readlink(srcPath), dstPath)
    } else {
      const src = createReadStream(srcPath, { highWaterMark: DEFAULT_HIGH_WATER_MARK })
      const dst = createWriteStream(dstPath, { mode: stats.mode, highWaterMark: DEFAULT_HIGH_WATER_MARK })
      if (onProgress) {
        await pipeline(src, createProgressTransform(onProgress), dst, { signal })
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
      throw this.destinationExistsError()
    }
    await removeFiles(dstPath)
  }

  private destinationExistsError(): NodeJS.ErrnoException {
    return Object.assign(new Error('Destination already exists'), { code: 'EEXIST' })
  }

  private async removeBestEffort(rPath: string): Promise<void> {
    try {
      await removeFiles(rPath)
    } catch {
      // Cleanup is best-effort and must not replace the transfer result.
    }
  }
}
