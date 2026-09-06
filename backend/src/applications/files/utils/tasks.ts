import { Dirent } from 'node:fs'
import fs from 'node:fs/promises'
import { FILE_OPERATION } from '../constants/operations'
import { isInternalTemporaryEntry, walkDir } from './files'
import { FileTaskProps, FileTaskStatus } from '../models/file-task'

export function isCrossDeviceError(error: unknown): error is NodeJS.ErrnoException {
  return (error as NodeJS.ErrnoException)?.code === 'EXDEV'
}

export function isTaskCancellable(type: FILE_OPERATION, dstPath?: string): boolean {
  switch (type) {
    case FILE_OPERATION.COPY:
    case FILE_OPERATION.DOWNLOAD:
    case FILE_OPERATION.COMPRESS:
    case FILE_OPERATION.DECOMPRESS:
      return true
    case FILE_OPERATION.MOVE:
    case FILE_OPERATION.DELETE:
      // The real rename capability is only authoritative at execution time.
      // Supplying a signal keeps the streamed EXDEV fallback cancellable.
      return Boolean(dstPath)
    default:
      return false
  }
}

export function isActiveTaskStatus(status: FileTaskStatus): boolean {
  return status === FileTaskStatus.PENDING || status === FileTaskStatus.QUEUED
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
    ignoredErrors,
    (entry) => !isInternalTemporaryEntry(entry.name)
  )

  return entriesCount
}
