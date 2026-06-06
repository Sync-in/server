import { Dirent } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { FILE_OPERATION } from '../constants/operations'
import { isPathExists, walkDir } from './files'
import type { FileTaskProps } from '../models/file-task'

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

export async function countDirEntriesAndSize(rPath: string): Promise<Pick<FileTaskProps, 'files' | 'directories' | 'size'>> {
  const entriesCount = { files: 0, directories: 0, size: 0 }
  const ignoredErrors: Record<string, string> = {}

  await walkDir(
    rPath,
    async (entry: Dirent, entryPath: string) => {
      if (entry.isDirectory()) {
        entriesCount.directories++
      } else {
        entriesCount.files++
        if (!entry.isFile()) return
        try {
          entriesCount.size += (await fs.stat(entryPath)).size
        } catch {
          // ignore
        }
      }
    },
    ignoredErrors
  )

  return entriesCount
}
