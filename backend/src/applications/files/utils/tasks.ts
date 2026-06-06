import { createReadStream, createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { DEFAULT_HIGH_WATER_MARK } from '../constants/files'
import { FILE_OPERATION } from '../constants/operations'
import { isPathExists, moveFiles, removeFiles } from './files'

export interface TransferOptions {
  // Runs immediately before the destination can be modified or published.
  beforeCommit?: () => Promise<void>
  // Identifies the owning task so cleanup can preserve its staging entry.
  cacheKey: string
  // Allows callers that already resolved the filesystem topology to skip another stat.
  crossDevice?: boolean
  // Provides the path whose progress must be watched during the transfer.
  onTransferStart?: (temporaryPath: string) => void
  overwrite?: boolean
  signal: AbortSignal
  // Preferred staging directory. Atomic publication requires it to share the destination filesystem.
  stagingDir?: string
}

export interface CopyTaskOptions extends TransferOptions {
  preserveTimestamps?: boolean
  recursive?: boolean
}

// The destination is committed, but the obsolete source still requires manual or deferred cleanup.
export class SourceCleanupError extends Error {
  constructor(
    readonly srcPath: string,
    readonly dstPath: string,
    options: ErrorOptions
  ) {
    super('Destination was published but the source could not be removed', options)
    this.name = SourceCleanupError.name
  }
}

export function taskTemporaryPrefix(cacheKey: string): string {
  return `.${cacheKey}-`
}

export function taskTemporaryPath(parentPath: string, cacheKey: string, name: string): string {
  return path.join(parentPath, `${taskTemporaryPrefix(cacheKey)}${path.basename(name)}`)
}

export async function createTaskTemporaryDir(parentPath: string, cacheKey: string, name: string): Promise<string> {
  await fs.mkdir(parentPath, { recursive: true })
  const temporaryPath = taskTemporaryPath(parentPath, cacheKey, name)
  await fs.mkdir(temporaryPath)
  return temporaryPath
}

async function copyEntry(srcPath: string, dstPath: string, recursive: boolean, preserveTimestamps: boolean, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  const stats = await fs.lstat(srcPath)
  if (stats.isDirectory()) {
    await fs.mkdir(dstPath)
    if (recursive) {
      for (const entry of await fs.readdir(srcPath)) {
        await copyEntry(path.join(srcPath, entry), path.join(dstPath, entry), true, preserveTimestamps, signal)
      }
    }
  } else if (stats.isSymbolicLink()) {
    await fs.symlink(await fs.readlink(srcPath), dstPath)
  } else {
    await pipeline(
      createReadStream(srcPath, { highWaterMark: DEFAULT_HIGH_WATER_MARK }),
      createWriteStream(dstPath, { mode: stats.mode, highWaterMark: DEFAULT_HIGH_WATER_MARK }),
      { signal }
    )
  }
  if (!stats.isSymbolicLink()) {
    await fs.chmod(dstPath, stats.mode)
    if (preserveTimestamps) {
      await fs.utimes(dstPath, stats.atime, stats.mtime)
    }
  }
}

async function existingParentPath(dstPath: string): Promise<string> {
  let parentPath = path.dirname(dstPath)
  while (!(await isPathExists(parentPath))) {
    const nextParentPath = path.dirname(parentPath)
    if (nextParentPath === parentPath) break
    parentPath = nextParentPath
  }
  return parentPath
}

export async function isCrossDeviceMove(srcPath: string, dstPath: string): Promise<boolean> {
  const [srcStats, dstParentStats] = await Promise.all([fs.lstat(srcPath), existingParentPath(dstPath).then((parentPath) => fs.stat(parentPath))])
  return srcStats.dev !== dstParentStats.dev
}

export async function isTaskCancellable(type: FILE_OPERATION, srcPath: string, dstPath?: string): Promise<boolean> {
  switch (type) {
    case FILE_OPERATION.COPY:
    case FILE_OPERATION.DOWNLOAD:
    case FILE_OPERATION.COMPRESS:
    case FILE_OPERATION.DECOMPRESS:
      return true
    case FILE_OPERATION.MOVE:
    case FILE_OPERATION.DELETE:
      if (!dstPath) return false
      try {
        return await isCrossDeviceMove(srcPath, dstPath)
      } catch {
        return false
      }
    default:
      return false
  }
}

async function prepareDestination(dstPath: string, overwrite: boolean): Promise<void> {
  if (!(await isPathExists(dstPath))) return
  if (!overwrite) {
    throw Object.assign(new Error('Destination already exists'), { code: 'EEXIST' })
  }
  await removeFiles(dstPath)
}

async function cleanupAfterFailure(rPath: string): Promise<void> {
  try {
    await removeFiles(rPath)
  } catch {
    // Cleanup is best-effort and must not replace the transfer error.
  }
}

export async function copyAbortable(srcPath: string, dstPath: string, options: CopyTaskOptions): Promise<void> {
  const {
    beforeCommit,
    cacheKey,
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

  // A staging file cannot be renamed atomically across filesystems. In that case,
  // copy directly to the destination and remove partial data on handled failures.
  // beforeCommit may already have moved an overwritten destination to trash when
  // cancellation occurs; this recoverable side effect is accepted for external filesystems.
  if (copyDirectlyToDestination) {
    let transferStarted = false
    try {
      // Check before modifying the destination, then again before starting the long direct transfer.
      signal.throwIfAborted()
      await beforeCommit?.()
      signal.throwIfAborted()
      await prepareDestination(dstPath, overwrite)
      onTransferStart?.(dstPath)
      transferStarted = true
      await copyEntry(srcPath, dstPath, recursive, preserveTimestamps, signal)
    } catch (e) {
      if (transferStarted) {
        await cleanupAfterFailure(dstPath)
      }
      throw e
    }
    return
  }

  // Same-filesystem staging keeps the destination untouched until the final rename.
  try {
    onTransferStart?.(temporaryPath)
    await copyEntry(srcPath, temporaryPath, recursive, preserveTimestamps, signal)
    signal.throwIfAborted()
    await beforeCommit?.()
    await prepareDestination(dstPath, overwrite)
    await fs.rename(temporaryPath, dstPath)
  } catch (e) {
    await cleanupAfterFailure(temporaryPath)
    throw e
  }
}

export async function moveAbortable(srcPath: string, dstPath: string, options: TransferOptions): Promise<SourceCleanupError | undefined> {
  const { beforeCommit, cacheKey, onTransferStart, overwrite = false, signal, stagingDir } = options
  const crossDevice = options.crossDevice ?? (await isCrossDeviceMove(srcPath, dstPath))
  if (!crossDevice) {
    signal.throwIfAborted()
    await beforeCommit?.()
    await moveFiles(srcPath, dstPath, overwrite)
    return
  }
  await copyAbortable(srcPath, dstPath, { beforeCommit, cacheKey, onTransferStart, overwrite, signal, stagingDir })
  try {
    await removeFiles(srcPath)
  } catch (cause) {
    // Publication is the commit point. The caller must update its persistent state before reporting this cleanup failure.
    return new SourceCleanupError(srcPath, dstPath, { cause })
  }
}
