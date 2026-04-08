import { Injectable, Logger } from '@nestjs/common'
import fs from 'fs/promises'
import { Stats } from 'node:fs'
import path from 'node:path'
import { CACHE_INDEXING_UPDATE_PREFIX, INDEXABLE_EXTENSIONS } from '../constants/indexing'
import { FileIndexContext, FileParseContext } from '../interfaces/file-parse-index'
import { FilesContentStore } from '../models/files-content-store'
import { FileContent } from '../schemas/file-content.interface'
import { docTextify } from '../utils/doc-textify/doc-textify'
import { PdfOCRWorkerManager } from '../utils/doc-textify/utils/pdf-ocr'
import { getExtensionWithoutDot, getMimeType } from '../utils/files'
import { FilesParser } from './files-parser.service'
import { genIndexingKey } from '../utils/indexing'
import { FILE_REPOSITORY } from '../constants/operations'
import { Cache } from '../../../infrastructure/cache/services/cache.service'

@Injectable()
export class FilesContentIndexer {
  private readonly maxDocumentSize = 150 * 1_000_000
  private readonly logger = new Logger(FilesContentIndexer.name)
  private pdfOcrWorkerManager: PdfOCRWorkerManager | null = null

  constructor(
    private readonly cache: Cache,
    private readonly filesIndexer: FilesContentStore,
    private readonly filesParser: FilesParser
  ) {}

  async updateIndexEntries() {
    const cacheKeys: string[] = []
    const [userIds, spaceIds, shareIds]: [number[], number[], number[]] = [[], [], []]
    for (const k of await this.cache.keys(`${CACHE_INDEXING_UPDATE_PREFIX}-*`)) {
      cacheKeys.push(k)
      const keySegments = k.split('-')
      const [repository, idPart] = keySegments.slice(-2)
      const id = Number.parseInt(idPart ?? '', 10)

      if (repository === FILE_REPOSITORY.USER) {
        userIds.push(id)
      } else if (repository === FILE_REPOSITORY.SPACE) {
        spaceIds.push(id)
      } else if (repository === FILE_REPOSITORY.SHARE) {
        shareIds.push(id)
      } else {
        this.logger.warn({ tag: this.updateIndexEntries.name, msg: `Unknown type: ${repository}` })
      }
    }

    if (userIds.length || spaceIds.length || shareIds.length) {
      try {
        await this.parseAndIndexAllFiles(userIds, spaceIds, shareIds)
      } catch (e) {
        this.logger.error({ tag: this.updateIndexEntries.name, msg: `${e}` })
      }
    }

    // Clean up event keys even if incremental indexing fails.
    // Ignore cache deletion errors, the full reindex restores consistency.
    for (const k of cacheKeys) {
      this.cache.del(k).catch((e) => this.logger.warn({ tag: this.updateIndexEntries.name, msg: `Unable to clean key: ${k} - ${e}` }))
    }
  }

  async parseAndIndexAllFiles(userIds?: number[], spaceIds?: number[], shareIds?: number[]): Promise<void> {
    this.pdfOcrWorkerManager = PdfOCRWorkerManager.getInstance(this.logger)
    try {
      await this.pdfOcrWorkerManager.start()
    } catch (e) {
      this.logger.warn({ tag: this.parseAndIndexAllFiles.name, msg: `unable to initialize OCR worker: ${e}` })
    }
    try {
      const indexSuffixes: string[] = []
      for await (const [id, type, paths] of this.filesParser.allPaths(userIds, spaceIds, shareIds)) {
        const indexSuffix = genIndexingKey(id, type)
        try {
          await this.indexFiles(indexSuffix, paths)
        } catch (e) {
          this.logger.error({ tag: this.parseAndIndexAllFiles.name, msg: `${e}` })
        }
        indexSuffixes.push(indexSuffix)
      }
      // clean up old tables only when all indexes have been indexed
      if (!userIds?.length && !spaceIds?.length && !shareIds?.length) {
        await this.filesIndexer.cleanIndexes(indexSuffixes)
      }
    } finally {
      await this.pdfOcrWorkerManager?.stop()
      this.pdfOcrWorkerManager = null
    }
  }

  private async indexFiles(indexSuffix: string, paths: FileParseContext[]): Promise<void> {
    const indexName = this.filesIndexer.getIndexName(indexSuffix)
    if (!(await this.filesIndexer.createIndex(indexName))) {
      return
    }
    const context: FileIndexContext = {
      indexSuffix: indexSuffix,
      pathPrefix: '',
      regexBasePath: undefined,
      db: await this.filesIndexer.getRecordStats(indexName),
      fs: new Set()
    }
    let indexedRecords = 0
    let errorRecords = 0

    for (const p of paths) {
      context.regexBasePath = new RegExp(`^/?${p.realPath}/?`)
      context.pathPrefix = p.pathPrefix || ''
      if (!p.isDir) {
        // Handles the space root file or shared file case
        const rootFileContent = await this.analyzeFile(p.realPath, context, true)
        if (rootFileContent !== null) {
          this.filesIndexer.insertRecord(indexName, rootFileContent).catch((e: Error) => {
            errorRecords++
            this.logger.error({ tag: this.indexFiles.name, msg: `${indexSuffix} | ${rootFileContent.name} : ${e}` })
          })
          indexedRecords++
        }
        continue
      }
      for await (const fileContent of this.parseFiles(p.realPath, context)) {
        this.filesIndexer.insertRecord(indexName, fileContent).catch((e: Error) => {
          errorRecords++
          this.logger.error({ tag: this.indexFiles.name, msg: `${indexSuffix} | ${fileContent.name} : ${e}` })
        })
        indexedRecords++
      }
    }

    if (context.db.size === 0 && indexedRecords === 0) {
      // case when no data
      this.filesIndexer
        .dropIndex(indexName)
        .catch((e: Error) => this.logger.error({ tag: this.indexFiles.name, msg: `${indexSuffix} - unable to drop index : ${e}` }))
      this.logger.verbose({ tag: this.indexFiles.name, msg: `${indexSuffix} - no data, index not stored` })
    } else {
      // clean up old records
      const recordsToDelete: number[] = [...context.db.keys()].filter((key) => !context.fs.has(key))
      if (recordsToDelete.length > 0) {
        this.filesIndexer
          .deleteRecords(indexName, recordsToDelete)
          .catch((e: Error) => this.logger.error({ tag: this.indexFiles.name, msg: `${indexSuffix} - unable to delete records : ${e}` }))
      }
      if (indexedRecords === 0 && errorRecords === 0 && recordsToDelete.length === 0) {
        this.logger.verbose({ tag: this.indexFiles.name, msg: `${indexSuffix} - no new data` })
      } else {
        this.logger.log({
          tag: this.indexFiles.name,
          msg: `${indexSuffix} - indexed: ${indexedRecords - errorRecords}, errors: ${errorRecords}, deleted: ${recordsToDelete.length}`
        })
      }
    }
  }

  private async *parseFiles(dir: string, context: FileIndexContext): AsyncGenerator<FileContent> {
    try {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const realPath = path.join(entry.parentPath, entry.name)
        if (entry.isDirectory()) {
          yield* this.parseFiles(realPath, context)
          continue
        }
        const fileContent = await this.analyzeFile(realPath, context, false)
        if (fileContent !== null) {
          yield fileContent
        }
      }
    } catch (e) {
      this.logger.warn({ tag: this.parseFiles.name, msg: `${context.indexSuffix} - unable to parse: ${dir} - ${e}` })
    }
  }

  private async analyzeFile(realPath: string, context: FileIndexContext, isRootFile = false): Promise<FileContent> {
    const extension = getExtensionWithoutDot(realPath)
    if (!INDEXABLE_EXTENSIONS.has(extension)) return null

    const fileName = isRootFile ? path.basename(context.pathPrefix) : path.basename(realPath)

    // ignore temporary documents
    if (fileName.startsWith('~$')) return null

    let stats: Stats
    try {
      stats = await fs.stat(realPath)
    } catch (e) {
      this.logger.warn({ tag: this.analyzeFile.name, msg: `unable to stats: ${realPath} - ${e}` })
      return null
    }
    if (stats.size === 0 || stats.size > this.maxDocumentSize) {
      return null
    }

    const filePath = isRootFile
      ? path.dirname(context.pathPrefix) || '.'
      : path.join(context.pathPrefix, path.dirname(realPath).replace(context.regexBasePath, '') || '.')

    const f = context.db.get(stats.ino)
    if (f && f.size === stats.size && f.path === filePath && f.name === fileName) {
      // no changes, store inode id & skip it
      context.fs.add(stats.ino)
      return null
    }

    // store inode id
    context.fs.add(stats.ino)

    // store the content with null value to not parse it later
    return {
      id: stats.ino,
      path: filePath,
      name: fileName,
      mime: getMimeType(realPath, false),
      size: stats.size,
      mtime: stats.mtime.getTime(),
      content: await this.parseContent(realPath, extension)
    }
  }

  private async parseContent(rPath: string, extension: string): Promise<string> {
    try {
      const content = await docTextify(
        rPath,
        {
          newlineDelimiter: ' ',
          minCharsToExtract: 10,
          ocrWorker: this.pdfOcrWorkerManager?.worker
        },
        {
          extension: extension,
          verified: true
        }
      )
      return content.length ? content : null
    } catch (e) {
      this.logger.warn({ tag: this.parseContent.name, msg: `unable to index: ${rPath} - ${e}` })
    }
    return null
  }
}
