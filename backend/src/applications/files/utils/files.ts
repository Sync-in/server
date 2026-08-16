import { HttpStatus } from '@nestjs/common'
import { WriteStream } from 'fs'
import fse from 'fs-extra'
import mime from 'mime-types'
import crypto from 'node:crypto'
import { createReadStream, createWriteStream, Dirent, statSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { formatDateISOString } from '../../../common/functions'
import { currentTimeStamp, isValidFileName, regExpPreventPathTraversal } from '../../../common/shared'
import { DEFAULT_CHECKSUM_ALGORITHM, DEFAULT_HIGH_WATER_MARK, EXTRA_MIMES_TYPE, TEMPORARY_FILE_PREFIX, TEMPORARY_PATH } from '../constants/files'
import { SYNC_TEMPORARY_FILE_PREFIX } from '../../sync/constants/sync'
import type { FileDBProps } from '../interfaces/file-db-props.interface'
import type { FileProps } from '../interfaces/file-props.interface'
import type { WriteFromStreamOptions, WriteUploadStreamOptions } from '../interfaces/write-stream.interface'
import { FileError } from '../models/file-error'
import { maxFileSizeExceededError } from './errors'

export function sanitizePath(fPath: string): string {
  return path.normalize(fPath).replace(regExpPreventPathTraversal, '')
}

export function isPathInside(basePath: string, candidatePath: string, allowBasePath = false): boolean {
  // Prevent lexical path traversal and prefix collisions by checking the resolved candidate against the base directory boundary.
  const resolvedBasePath = path.resolve(basePath)
  const resolvedCandidatePath = path.resolve(candidatePath)
  if (resolvedCandidatePath === resolvedBasePath) {
    return allowBasePath
  }
  const basePathPrefix = resolvedBasePath.endsWith(path.sep) ? resolvedBasePath : `${resolvedBasePath}${path.sep}`
  return resolvedCandidatePath.startsWith(basePathPrefix)
}

export function isInternalTemporaryEntry(name: string): boolean {
  return name === TEMPORARY_PATH.STORAGE || name.startsWith(SYNC_TEMPORARY_FILE_PREFIX)
}

export function isInternalTemporaryPath(basePath: string, candidatePath: string): boolean {
  const relativePath = path.relative(path.resolve(basePath), path.resolve(candidatePath))
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.startsWith(`..${path.sep}`) || relativePath === '..') return false
  return relativePath.split(path.sep).some(isInternalTemporaryEntry)
}

export function sanitizeName(name: string): string {
  return name
    .replace(/[/\\]/g, '') // remove slashes
    .replace(/\.\./g, '') // remove '..'
    .replace(/^\s+|[. ]+$/g, '') // trimStart + trimEnd + strip trailing dots
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

async function existingParentPath(rPath: string): Promise<string> {
  let parentPath = path.dirname(rPath)
  while (!(await isPathExists(parentPath))) {
    const nextParentPath = path.dirname(parentPath)
    if (nextParentPath === parentPath) break
    parentPath = nextParentPath
  }
  return parentPath
}

export async function isCrossDevice(srcPath: string, dstPath: string): Promise<boolean> {
  const [srcStats, dstParentStats] = await Promise.all([fs.lstat(srcPath), existingParentPath(dstPath).then((parentPath) => fs.stat(parentPath))])
  return srcStats.dev !== dstParentStats.dev
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

const MAX_TEMPORARY_FILE_NAME_BYTES = 255

function temporaryNameSegment(value: string, label: string): string {
  const segment = value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  if (!segment) throw new Error(`Invalid temporary-file ${label}`)
  return segment
}

function truncateUtf8(value: string, maxBytes: number): string {
  let result = ''
  let length = 0
  for (const character of value) {
    const characterLength = Buffer.byteLength(character)
    if (length + characterLength > maxBytes) break
    result += character
    length += characterLength
  }
  return result
}

function truncateTemporaryBasename(name: string, maxBytes: number): string {
  if (Buffer.byteLength(name) <= maxBytes) return name
  const extension = path.extname(name)
  const extensionLength = Buffer.byteLength(extension)
  if (extension && extensionLength < maxBytes) {
    const stem = path.basename(name, extension)
    return `${truncateUtf8(stem, maxBytes - extensionLength)}${extension}`
  }
  return truncateUtf8(name, maxBytes)
}

export function temporaryFilePrefix(operation: string, executionId: string): string {
  return `${TEMPORARY_FILE_PREFIX}${temporaryNameSegment(operation, 'operation')}-${temporaryNameSegment(executionId, 'execution id')}-`
}

export function temporaryFileName(targetPath: string, operation: string, executionId: string = crypto.randomUUID()): string {
  const prefix = temporaryFilePrefix(operation, executionId)
  const basename = sanitizeName(fileName(targetPath)) || 'file'
  const basenameBytes = MAX_TEMPORARY_FILE_NAME_BYTES - Buffer.byteLength(prefix)
  if (basenameBytes < 1) throw new Error('Temporary-file prefix exceeds the filesystem filename limit')
  return `${prefix}${truncateTemporaryBasename(basename, basenameBytes)}`
}

export function temporaryFilePath(parentPath: string, targetPath: string, operation: string, executionId?: string): string {
  return path.join(parentPath, temporaryFileName(targetPath, operation, executionId))
}

export async function makeTemporaryDirectory(parentPath: string, targetPath: string, operation: string, executionId?: string): Promise<string> {
  await makeDir(parentPath, true)
  const temporaryPath = temporaryFilePath(parentPath, targetPath, operation, executionId)
  await fs.mkdir(temporaryPath)
  return temporaryPath
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

export function getExtensionWithoutDot(fPath: string): string {
  return path.extname(fPath).slice(1).toLowerCase()
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

export function genHash(str: string, algo = 'md5', encoding: crypto.BinaryToTextEncoding = 'hex'): string {
  return crypto.createHash(algo).update(str).digest(encoding)
}

export function genUniqHashFromFileDBProps(dbFile: FileDBProps) {
  const dbFileString = `${Object.keys(dbFile)
    .sort()
    .map((k) => `${k}=${String(dbFile[k])}`)
    .join('|')}`
  return genHash(dbFileString, DEFAULT_CHECKSUM_ALGORITHM)
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
    const resolvedSrcPath = path.resolve(srcPath)
    await fse.copy(srcPath, dstPath, {
      overwrite,
      preserveTimestamps,
      filter: (entryPath) => path.resolve(entryPath) === resolvedSrcPath || !isInternalTemporaryEntry(path.basename(entryPath))
    })
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

export function createSizeLimiter(maxSize: number, maxSizeError: () => Error = maxFileSizeExceededError): (bytes: number) => void {
  let transferred = 0
  return (bytes: number) => {
    transferred += bytes
    if (transferred > maxSize) throw maxSizeError()
  }
}

export function createProgressTransform(
  onProgress?: (bytes: number) => void,
  maxSize?: number,
  maxSizeError: () => Error = maxFileSizeExceededError
): Transform {
  const checkSize = maxSize === undefined ? undefined : createSizeLimiter(maxSize, maxSizeError)
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      try {
        checkSize?.(chunk.length)
        onProgress?.(chunk.length)
      } catch (error) {
        callback(error as Error)
        return
      }
      callback(null, chunk)
    }
  })
}

export function writeFromStream(rPath: string, stream: Readable, options: WriteFromStreamOptions = {}): Promise<void> {
  const { start = 0, signal, accountBytes } = options
  const dst: WriteStream = createWriteStream(rPath, { flags: start ? 'a' : 'w', start: start, highWaterMark: DEFAULT_HIGH_WATER_MARK })
  if (!accountBytes) {
    return pipeline(stream, dst, { signal })
  }
  const accounting = new Transform({
    transform(chunk, _encoding, callback) {
      try {
        accountBytes(chunk.length)
      } catch (error) {
        callback(error as Error)
        return
      }
      callback(null, chunk)
    }
  })
  return pipeline(stream, accounting, dst, { signal })
}

export async function writeFromStreamAndChecksum(
  rPath: string,
  stream: Readable,
  alg: string,
  options: WriteFromStreamOptions = {}
): Promise<string> {
  const { start = 0, signal, accountBytes } = options
  const hash = crypto.createHash(alg)
  if (start) {
    // Seed the hash with the existing prefix so the result covers the complete resumed file.
    const src = createReadStream(rPath, { highWaterMark: DEFAULT_HIGH_WATER_MARK })
    await pipeline(src, hash, { end: false, signal })
  }
  const dst = createWriteStream(rPath, { flags: start ? 'a' : 'w', highWaterMark: DEFAULT_HIGH_WATER_MARK })
  await pipeline(
    stream,
    async function* (source) {
      for await (const chunk of source) {
        accountBytes?.(chunk.length)
        hash.update(chunk)
        yield chunk
      }
    },
    dst,
    { signal }
  )
  hash.end()
  return hash.digest('hex')
}

function uploadWriteOptions({ limiter, signal, onProgress }: WriteUploadStreamOptions): WriteFromStreamOptions {
  return {
    start: limiter.initialFileSize,
    signal,
    accountBytes: (bytes) => {
      // Progress must only include chunks accepted by both the file-size and quota boundaries.
      limiter.consume(bytes)
      onProgress?.(bytes)
    }
  }
}

export function writeUploadFromStream(rPath: string, stream: Readable, options: WriteUploadStreamOptions): Promise<void> {
  return writeFromStream(rPath, stream, uploadWriteOptions(options))
}

export function writeUploadFromStreamAndChecksum(rPath: string, stream: Readable, alg: string, options: WriteUploadStreamOptions): Promise<string> {
  return writeFromStreamAndChecksum(rPath, stream, alg, uploadWriteOptions(options))
}

export function copyFileContent(srcPath: string, dstPath: string): Promise<void> {
  const srcStream = createReadStream(srcPath, { highWaterMark: DEFAULT_HIGH_WATER_MARK })
  return writeFromStream(dstPath, srcStream)
}

export async function walkDir(
  rPath: string,
  onEntry: (entry: Dirent, entryPath: string) => Promise<void> | void,
  errors?: Record<string, string>,
  includeEntry?: (entry: Dirent, entryPath: string) => boolean
): Promise<void> {
  let entries: Dirent[]

  try {
    entries = await fs.readdir(rPath, { withFileTypes: true })
  } catch (e: any) {
    if (!errors) throw e
    errors[rPath] = e.message
    return
  }

  for (const entry of entries) {
    const entryPath = path.join(rPath, entry.name)
    if (includeEntry && !includeEntry(entry, entryPath)) continue
    await onEntry(entry, entryPath)
    if (entry.isDirectory()) {
      await walkDir(entryPath, onEntry, errors, includeEntry)
    }
  }
}

export async function dirSize(rPath: string): Promise<[number, any]> {
  let size = 0
  const errors: Record<string, string> = {}

  await walkDir(
    rPath,
    async (entry, entryPath) => {
      if (!entry.isFile()) return
      try {
        size += (await fs.stat(entryPath)).size
      } catch (e: any) {
        errors[entryPath] = e.message
      }
    },
    errors
  )
  return [size, errors]
}

export async function dirListFileNames(rPath: string): Promise<string[]> {
  return (await fs.readdir(rPath)).map((path: string) => fileName(path))
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

export async function uniqueDatedFilePath(rPath: string, knownIsDir?: boolean): Promise<{ isDir: boolean; path: string }> {
  const date = formatDateISOString(new Date())
  const isDir = knownIsDir ?? (await isPathIsDir(rPath))
  const extension = isDir ? '' : path.extname(rPath)
  const nameWithoutExtension = path.basename(rPath, extension)
  const datedName = `${nameWithoutExtension}-${date}`
  const parentDir = path.dirname(rPath)
  let candidate = path.join(parentDir, `${datedName}${extension}`)
  let count = 1
  while (await isPathExists(candidate)) {
    candidate = path.join(parentDir, `${datedName} (${count})${extension}`)
    count++
  }
  return { isDir, path: candidate }
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
