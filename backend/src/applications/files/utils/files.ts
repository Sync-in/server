import { HttpStatus } from '@nestjs/common'
import { WriteStream } from 'fs'
import fse from 'fs-extra'
import mime from 'mime-types'
import crypto from 'node:crypto'
import { createReadStream, createWriteStream, Dirent, statSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { formatDateISOString } from '../../../common/functions'
import { currentTimeStamp, isValidFileName, regExpPreventPathTraversal } from '../../../common/shared'
import { DEFAULT_CHECKSUM_ALGORITHM, DEFAULT_HIGH_WATER_MARK, EXTRA_MIMES_TYPE } from '../constants/files'
import type { FileDBProps } from '../interfaces/file-db-props.interface'
import type { FileProps } from '../interfaces/file-props.interface'
import { FileError } from '../models/file-error'

export function sanitizePath(fPath: string): string {
  return path.normalize(fPath).replace(regExpPreventPathTraversal, '')
}

export function sanitizeName(name: string): string {
  return name
    .replace(/^\s+|[. ]+$/g, '') // trimStart + trimEnd + strip trailing dots
    .replace(/[/\\]/g, '') // remove slashes
    .replace(/\.\./g, '') // remove '..'
}

export function checkFileName(fPath: string): string {
  const fName = fileName(fPath)
  try {
    isValidFileName(fName)
    return fName
  } catch {
    throw new FileError(HttpStatus.BAD_REQUEST, 'Forbidden characters')
  }
}

export function isPathExists(rPath: string): Promise<boolean> {
  return fse.pathExists(rPath)
}

export async function isPathIsReadable(rPath: string): Promise<boolean> {
  try {
    await fs.access(rPath, fs.constants.R_OK)
  } catch {
    return false
  }
  return true
}

export async function isPathIsWriteable(rPath: string): Promise<boolean> {
  try {
    await fs.access(rPath, fs.constants.W_OK)
  } catch {
    return false
  }
  return true
}

export async function isPathIsDir(rPath: string): Promise<boolean> {
  return (await fs.stat(rPath)).isDirectory()
}

export function fileName(fPath: string): string {
  return path.posix.basename(fPath)
}

export function dirName(fPath: string): string {
  return path.dirname(fPath)
}

export async function fileSize(rPath: string): Promise<number> {
  return (await fs.stat(rPath)).size
}

export function createEmptyFile(rPath: string): Promise<void> {
  return fs.writeFile(rPath, '')
}

export function makeDir(rPath: string, recursive?: boolean): Promise<string> {
  return fs.mkdir(rPath, { recursive: recursive })
}

export function getMimeType(fPath: string, isDir: boolean): string {
  if (isDir) {
    return 'directory'
  }
  const extName: string = path.extname(fPath)
  if (EXTRA_MIMES_TYPE.has(extName)) {
    return EXTRA_MIMES_TYPE.get(extName)
  }
  const m = mime.lookup(extName)
  if (m) {
    return m.replace('/', '-')
  }
  return 'file'
}

export function genEtag(file?: Pick<FileProps, 'size' | 'mtime'>, rPath?: string, weakPrefix = true): string {
  if (!file) {
    if (!rPath) throw new Error('File or path are missing')
    const stats = statSync(rPath)
    file = { size: stats.size, mtime: stats.mtime.getTime() }
  }
  const etag = `${file.size.toString(16)}-${file.mtime.toString(16)}`
  return weakPrefix ? `W/"${etag}"` : etag
}

export function genUniqHashFromFileDBProps(dbFile: FileDBProps) {
  const dbFileString = `${Object.keys(dbFile)
    .sort()
    .map((k) => `${k}=${String(dbFile[k])}`)
    .join('|')}`
  return crypto.createHash(DEFAULT_CHECKSUM_ALGORITHM).update(dbFileString, 'utf-8').digest('hex')
}

export function removeFiles(rPath: string): Promise<void> {
  // if the file does not exist, no error is thrown
  return fse.remove(rPath)
}

export async function getProps(rPath: string, fPath?: string, isDir?: boolean): Promise<FileProps> {
  const stats = await fs.stat(rPath)
  const isDirectory = isDir === undefined ? stats.isDirectory() : isDir
  return {
    id: -stats.ino, // use negative number to avoid conflicts with existing database ids
    path: dirName(fPath !== undefined ? fPath : rPath),
    name: fileName(fPath !== undefined ? fPath : rPath),
    isDir: isDirectory,
    size: isDirectory ? 0 : stats.size,
    ctime: stats.birthtime.getTime(),
    mtime: stats.mtime.getTime(),
    mime: getMimeType(rPath, isDirectory)
  }
}

export function touchFile(rPath: string, mtime?: number): Promise<void> {
  if (!mtime) mtime = currentTimeStamp()
  return fs.utimes(rPath, mtime, mtime)
}

export async function copyFiles(srcPath: string, dstPath: string, overwrite = false, recursive = true, preserveTimestamps = true): Promise<void> {
  /*
    If src is a directory it will copy everything inside of this directory, not the entire directory itself
    If src is a file, dest cannot be a directory
   */
  if (!recursive && (await isPathIsDir(srcPath))) {
    await fs.mkdir(dstPath)
    if (preserveTimestamps) {
      const stat = await fs.stat(srcPath)
      await fs.utimes(dstPath, stat.atime, stat.mtime)
    }
  } else {
    await fse.copy(srcPath, dstPath, { overwrite, preserveTimestamps: preserveTimestamps })
  }
}

export function moveFiles(srcPath: string, dstPath: string, overwrite = false): Promise<void> {
  /*
    If src is a file, dest must be a file and when src is a directory, dest must be a directory
   */
  return fse.move(srcPath, dstPath, { overwrite })
}

export async function checksumFile(filePath: string, alg: string): Promise<string> {
  const hash = crypto.createHash(alg)
  const stream = createReadStream(filePath, { highWaterMark: DEFAULT_HIGH_WATER_MARK })
  await pipeline(stream, hash)
  return hash.digest('hex')
}

export function writeFromStream(rPath: string, stream: Readable, start: number = 0): Promise<void> {
  const dst: WriteStream = createWriteStream(rPath, { flags: start ? 'a' : 'w', start: start, highWaterMark: DEFAULT_HIGH_WATER_MARK })
  return pipeline(stream, dst)
}

export async function writeFromStreamAndChecksum(rPath: string, stream: Readable, hasRange: number, alg: string): Promise<string> {
  const hash = crypto.createHash(alg)
  if (hasRange) {
    const src = createReadStream(rPath, { highWaterMark: DEFAULT_HIGH_WATER_MARK })
    await pipeline(src, hash, { end: false })
  }
  const dst = createWriteStream(rPath, { flags: hasRange ? 'a' : 'w', highWaterMark: DEFAULT_HIGH_WATER_MARK })
  await pipeline(
    stream,
    async function* (source) {
      for await (const chunk of source) {
        hash.update(chunk)
        yield chunk
      }
    },
    dst
  )
  hash.end()
  return hash.digest('hex')
}

export function copyFileContent(srcPath: string, dstPath: string): Promise<void> {
  const srcStream = createReadStream(srcPath, { highWaterMark: DEFAULT_HIGH_WATER_MARK })
  return writeFromStream(dstPath, srcStream)
}

export async function dirSize(rPath: string): Promise<[number, any]> {
  let size = 0
  const errors: Record<string, string> = {}
  for (const f of await fs.readdir(rPath, { withFileTypes: true, recursive: true })) {
    if (f.isFile()) {
      const p = path.join(f.parentPath, f.name)
      try {
        size += (await fs.stat(p)).size
      } catch (e: any) {
        errors[p] = e.message
      }
    }
  }
  return [size, errors]
}

export async function dirListFileNames(rPath: string): Promise<string[]> {
  return (await fs.readdir(rPath)).map((path: string) => fileName(path))
}

export async function countDirEntries(rPath: string): Promise<{ files: number; directories: number }> {
  return (await fs.readdir(rPath, { withFileTypes: true, recursive: true })).reduce(
    (acc, f: Dirent) => {
      if (f.isDirectory()) {
        acc.directories++
      } else {
        acc.files++
      }
      return acc
    },
    { files: 0, directories: 0 }
  )
}

export async function dirHasChildren(rPath: string, mustContainsDirs = true): Promise<boolean> {
  for await (const file of await fs.opendir(rPath)) {
    if (mustContainsDirs) {
      if (file.isDirectory()) return true
    } else {
      return true
    }
  }
  return false
}

export async function uniqueFilePathFromDir(rPath: string): Promise<string> {
  if (await isPathExists(rPath)) {
    const parentDir = path.dirname(rPath)
    const extension = path.extname(rPath)
    const nameWithoutExtension = path.basename(rPath, extension)
    let count = 1
    while (await isPathExists(path.join(parentDir, `${nameWithoutExtension} (${count})${extension}`))) {
      count++
    }
    return path.join(parentDir, `${nameWithoutExtension} (${count})${extension}`)
  }
  return rPath
}

export async function uniqueDatedFilePath(rPath: string): Promise<{ isDir: boolean; path: string }> {
  const date = formatDateISOString(new Date())
  if (await isPathIsDir(rPath)) {
    return { isDir: true, path: `${rPath}-${date}` }
  } else {
    const extension = path.extname(rPath)
    const nameWithoutExtension = path.basename(rPath, extension)
    return { isDir: false, path: path.join(path.dirname(rPath), `${nameWithoutExtension}-${date}${extension}`) }
  }
}

export async function checkExternalPath(rPath: string) {
  if (!(await isPathExists(rPath))) {
    throw new FileError(HttpStatus.NOT_FOUND, 'The location does not exist')
  }
  if (!(await isPathIsReadable(rPath))) {
    throw new FileError(HttpStatus.NOT_ACCEPTABLE, 'The location is not readable')
  }
  if (!(await isPathIsWriteable(rPath))) {
    throw new FileError(HttpStatus.NOT_ACCEPTABLE, 'The location is not writeable')
  }
}
