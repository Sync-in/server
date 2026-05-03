import { Injectable, Logger } from '@nestjs/common'
import fs from 'fs/promises'
import { Stats } from 'node:fs'
import path from 'node:path'
import {
  CACHE_INDEXING_EVENT_LAST_RUN_KEY,
  CACHE_INDEXING_EVENT_PREFIX,
  CACHE_INDEXING_FULL_RUN_REQUEST_KEY,
  CACHE_INDEXING_FULL_RUN_REQUEST_TTL,
  CACHE_INDEXING_LAST_RUN_KEY,
  CACHE_INDEXING_RUNNING_KEY,
  CACHE_INDEXING_RUNNING_TTL,
  INDEXABLE_EXTENSIONS
} from '../constants/indexing'
import { FileContentIndexContext, FileParseContext } from '../interfaces/file-parse-index'
import { FilesContentStore } from '../models/files-content-store'
import { FileContent, FileContentMetadata } from '../schemas/file-content.interface'
import { docTextify } from '../utils/doc-textify/doc-textify'
import { OCRManager } from '../utils/doc-textify/utils/ocr'
import { getExtensionWithoutDot, getMimeType } from '../utils/files'
import { FilesContentParser } from './files-content-parser.service'
import { genIndexingKey, genRunId } from '../utils/indexing'
import { FILE_REPOSITORY } from '../constants/operations'
import { Cache } from '../../../infrastructure/cache/services/cache.service'
import { IndexingState, IndexingStatus } from '../interfaces/indexing.interface'
import { escapePath } from '../../../common/functions'
import { configuration } from '../../../configuration/config.environment'

@Injectable()
export class FilesContentIndexer {
  public isEnabled = configuration.applications.files.contentIndexing.enabled
  private readonly logger = new Logger(FilesContentIndexer.name)
  private readonly maxDocumentSize = 150 * 1_000_000
  private readonly metadataBatchSize = 1000
  private ocrManager: OCRManager | null = null

  constructor(
    private readonly cache: Cache,
    private readonly filesContentStore: FilesContentStore,
    private readonly filesParser: FilesContentParser
  ) {}

  isRunning(): Promise<boolean> {
    return this.cache.has(CACHE_INDEXING_RUNNING_KEY)
  }

  async resetIndexingRuntimeState(): Promise<void> {
    await this.setRunning(false)
    await this.cache.del(CACHE_INDEXING_FULL_RUN_REQUEST_KEY)
  }

  async startIndexing(): Promise<boolean> {
    if (!this.isEnabled || (await this.isRunning())) return false
    return this.requestFullIndexing()
  }

  async requestFullIndexing(): Promise<boolean> {
    if (!this.isEnabled) return false
    // defer full indexing to the indexing queue instead of starting it from the caller
    await this.cache.set(CACHE_INDEXING_FULL_RUN_REQUEST_KEY, Date.now(), CACHE_INDEXING_FULL_RUN_REQUEST_TTL)
    return true
  }

  async stopIndexing(): Promise<boolean> {
    if (!this.isEnabled) return false
    if (await this.isRunning()) {
      // cancel any pending full run before asking the current run to stop
      await this.cache.del(CACHE_INDEXING_FULL_RUN_REQUEST_KEY)
      await this.cache.set(CACHE_INDEXING_RUNNING_KEY, IndexingState.STOPPING, CACHE_INDEXING_RUNNING_TTL)
      return true
    }
    if (await this.cache.has(CACHE_INDEXING_FULL_RUN_REQUEST_KEY)) {
      // no run started yet, only remove the deferred scheduler request
      await this.cache.del(CACHE_INDEXING_FULL_RUN_REQUEST_KEY)
      return true
    }
    return false
  }

  async status(): Promise<IndexingStatus> {
    const runningState: IndexingState = this.isEnabled ? await this.cache.get(CACHE_INDEXING_RUNNING_KEY) : IndexingState.DISABLED
    const status: IndexingStatus = {
      indexesCount: 0,
      // PENDING is derived from the deferred full-run key, not from the running state
      state: runningState ?? ((await this.cache.has(CACHE_INDEXING_FULL_RUN_REQUEST_KEY)) ? IndexingState.PENDING : IndexingState.IDLE),
      lastFullRunAt: (await this.cache.get(CACHE_INDEXING_LAST_RUN_KEY)) ?? null,
      lastPartialRunAt: (await this.cache.get(CACHE_INDEXING_EVENT_LAST_RUN_KEY)) ?? null
    }
    try {
      status.indexesCount = await this.filesContentStore.indexesCount()
    } catch (e) {
      this.logger.error({ tag: this.status.name, msg: `${e}` })
    }
    return status
  }

  async dropIndexes(): Promise<void> {
    const state: IndexingState = await this.cache.get(CACHE_INDEXING_RUNNING_KEY)
    if (!state || state === IndexingState.IDLE) {
      await this.filesContentStore.dropAllIndexes()
    }
  }

  async processIndexingQueue() {
    await this.setRunning(true)
    try {
      if (await this.cache.has(CACHE_INDEXING_FULL_RUN_REQUEST_KEY)) {
        // scheduler consumes full-run requests before processing partial update events
        await this.cache.del(CACHE_INDEXING_FULL_RUN_REQUEST_KEY)
        try {
          await this.parseAndIndexAllFiles()
        } catch (e) {
          this.logger.error({ tag: this.processIndexingQueue.name, msg: `${e}` })
        }
        return
      }

      const cacheKeys: string[] = []
      const [userIds, spaceIds, shareIds]: [number[], number[], number[]] = [[], [], []]
      for (const k of await this.cache.keys(`${CACHE_INDEXING_EVENT_PREFIX}-*`)) {
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
          this.logger.warn({ tag: this.processIndexingQueue.name, msg: `Unknown type: ${repository}` })
        }
      }

      if (userIds.length || spaceIds.length || shareIds.length) {
        if ((await this.cache.get(CACHE_INDEXING_RUNNING_KEY)) !== IndexingState.STOPPING) {
          try {
            await this.parseAndIndexAllFiles(userIds, spaceIds, shareIds)
            await this.cache.set(CACHE_INDEXING_EVENT_LAST_RUN_KEY, Date.now(), 0)
          } catch (e) {
            this.logger.error({ tag: this.processIndexingQueue.name, msg: `${e}` })
          }
        }
      }

      // Clean up event keys even if incremental indexing fails.
      // Ignore cache deletion errors, the full reindex restores consistency.
      for (const k of cacheKeys) {
        this.cache.del(k).catch((e) => this.logger.warn({ tag: this.processIndexingQueue.name, msg: `Unable to clean key: ${k} - ${e}` }))
      }
    } finally {
      await this.setRunning(false)
    }
  }

  private async parseAndIndexAllFiles(userIds?: number[], spaceIds?: number[], shareIds?: number[]): Promise<void> {
    await this.setRunning(true)
    this.ocrManager = OCRManager.getInstance(this.logger)
    try {
      try {
        await this.ocrManager.start()
      } catch (e) {
        this.logger.warn({ tag: this.parseAndIndexAllFiles.name, msg: `unable to initialize OCR worker: ${e}` })
      }
      const indexSuffixes: string[] = []
      let stopped = false
      for (const { id, type, paths } of await this.filesParser.allPaths(userIds, spaceIds, shareIds)) {
        if ((await this.cache.get(CACHE_INDEXING_RUNNING_KEY)) === IndexingState.STOPPING) {
          stopped = true
          break
        }
        const indexSuffix = genIndexingKey(id, type)
        try {
          await this.indexFiles(indexSuffix, paths)
        } catch (e) {
          this.logger.error({ tag: this.parseAndIndexAllFiles.name, msg: `${e}` })
        }
        indexSuffixes.push(indexSuffix)
        // renew the TTL after each indexed space to prevent expiration during long runs
        this.renewRunningTTL().catch((e) => this.logger.warn({ tag: this.parseAndIndexAllFiles.name, msg: `unable to refresh running TTL: ${e}` }))
      }
      // clean up old tables only when all indexes have been indexed
      if (!stopped && !userIds?.length && !spaceIds?.length && !shareIds?.length) {
        await this.filesContentStore.cleanIndexes(indexSuffixes)
        await this.cache.set(CACHE_INDEXING_LAST_RUN_KEY, Date.now(), 0)
      }
    } finally {
      await this.ocrManager?.stop()
      this.ocrManager = null
      await this.setRunning(false)
    }
  }

  private async setRunning(state: boolean): Promise<void> {
    if (state) {
      const current: IndexingState = await this.cache.get(CACHE_INDEXING_RUNNING_KEY)
      if (current !== IndexingState.STOPPING) {
        await this.cache.set(CACHE_INDEXING_RUNNING_KEY, IndexingState.RUNNING, CACHE_INDEXING_RUNNING_TTL)
      }
    } else {
      await this.cache.del(CACHE_INDEXING_RUNNING_KEY)
    }
  }

  private async renewRunningTTL(): Promise<void> {
    // only renew if still running, preserve the stopping state
    const state: IndexingState = await this.cache.get(CACHE_INDEXING_RUNNING_KEY)
    if (state === IndexingState.RUNNING) {
      await this.cache.set(CACHE_INDEXING_RUNNING_KEY, IndexingState.RUNNING, CACHE_INDEXING_RUNNING_TTL)
    }
  }

  private async indexFiles(indexSuffix: string, paths: FileParseContext[]): Promise<void> {
    const indexName = this.filesContentStore.getIndexName(indexSuffix)
    if (!(await this.filesContentStore.createIndex(indexName))) {
      return
    }
    // mark records seen during this pass without loading all metadata in memory
    const runId = genRunId()
    const context: FileContentIndexContext = {
      indexName: indexName,
      pathPrefix: '',
      regexBasePath: undefined
    }
    let indexedRecords = 0
    let indexingErrors = 0
    let scannedRecords = 0

    const processBatch = async (batch: FileContentMetadata[]): Promise<void> => {
      const result = await this.indexFileMetadataBatch(indexName, runId, batch)
      indexedRecords += result.indexedRecords
      indexingErrors += result.indexingErrors
      scannedRecords += batch.length
    }

    for (const p of paths) {
      context.regexBasePath = new RegExp(`^/?${escapePath(p.realPath)}/?`)
      context.pathPrefix = p.pathPrefix || ''
      if (!p.isDir) {
        // Handles the space root file or shared file case
        const rootFileMetadata = await this.getFileMetadata(p.realPath, context, true)
        if (rootFileMetadata !== null) {
          await processBatch([rootFileMetadata])
        }
        continue
      }
      let batch: FileContentMetadata[] = []
      for await (const fileMetadata of this.parseFileMetadata(p.realPath, context)) {
        batch.push(fileMetadata)
        if (batch.length >= this.metadataBatchSize) {
          await processBatch(batch)
          batch = []
        }
      }
      await processBatch(batch)
    }

    // remove records not seen during this indexing pass
    const deletedRecords = await this.filesContentStore.deleteUnseenRecords(indexName, runId)

    if (scannedRecords === 0 && indexedRecords === 0 && deletedRecords === 0) {
      // case when no data
      this.filesContentStore
        .dropIndex(indexName)
        .catch((e: Error) => this.logger.error({ tag: this.indexFiles.name, msg: `${indexSuffix} - unable to drop index : ${e}` }))
      this.logger.verbose({ tag: this.indexFiles.name, msg: `${indexSuffix} - no data, index not stored` })
    } else if (indexedRecords === 0 && indexingErrors === 0 && deletedRecords === 0) {
      this.logger.verbose({ tag: this.indexFiles.name, msg: `${indexSuffix} - no new data` })
    } else {
      this.logger.log({
        tag: this.indexFiles.name,
        msg: `${indexSuffix} - indexed: ${indexedRecords - indexingErrors}, deleted: ${deletedRecords}, errors: ${indexingErrors}`
      })
    }
  }

  private async indexFileMetadataBatch(
    indexName: string,
    runId: string,
    batch: FileContentMetadata[]
  ): Promise<{ indexedRecords: number; indexingErrors: number }> {
    if (!batch.length) {
      return { indexedRecords: 0, indexingErrors: 0 }
    }

    const dbRecords = await this.filesContentStore.getRecordMetadataByIds(
      indexName,
      batch.map((f) => f.id)
    )
    const seenRecordIds: number[] = []
    let indexedRecords = 0
    let indexingErrors = 0

    for (const fileMetadata of batch) {
      const dbRecord = dbRecords.get(fileMetadata.id)
      if (dbRecord && dbRecord.size === fileMetadata.size && dbRecord.path === fileMetadata.path && dbRecord.name === fileMetadata.name) {
        seenRecordIds.push(fileMetadata.id)
        continue
      }

      if ((await this.filesContentStore.insertRecord(indexName, await this.buildFileContent(fileMetadata), runId)) === false) {
        indexingErrors++
        if (dbRecord) {
          // keep the previous record if refreshing its content failed
          seenRecordIds.push(fileMetadata.id)
        }
      }
      indexedRecords++
    }

    if (!(await this.filesContentStore.markRecordsSeen(indexName, seenRecordIds, runId))) {
      throw new Error(`${indexName} - unable to mark records as seen`)
    }
    return { indexedRecords, indexingErrors }
  }

  private async *parseFileMetadata(dir: string, context: FileContentIndexContext): AsyncGenerator<FileContentMetadata> {
    try {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const realPath = path.join(entry.parentPath, entry.name)
        if (entry.isDirectory()) {
          yield* this.parseFileMetadata(realPath, context)
          continue
        }
        const fileMetadata = await this.getFileMetadata(realPath, context, false)
        if (fileMetadata !== null) {
          yield fileMetadata
        }
      }
    } catch (e) {
      // skip unreadable directories, their unseen records will be cleaned later
      this.logger.warn({ tag: this.parseFileMetadata.name, msg: `${context.indexName} - unable to parse: ${dir} - ${e}` })
    }
  }

  private async getFileMetadata(realPath: string, context: FileContentIndexContext, isRootFile = false): Promise<FileContentMetadata | null> {
    const extension = getExtensionWithoutDot(realPath)
    if (!INDEXABLE_EXTENSIONS.has(extension)) return null

    const fileName = isRootFile ? path.basename(context.pathPrefix) : path.basename(realPath)

    // ignore temporary documents
    if (fileName.startsWith('~$')) return null

    let stats: Stats
    try {
      stats = await fs.stat(realPath)
    } catch (e) {
      this.logger.warn({ tag: this.getFileMetadata.name, msg: `unable to stats: ${realPath} - ${e}` })
      // unreadable or missing files are treated as unseen records
      return null
    }
    if (stats.size === 0 || stats.size > this.maxDocumentSize) {
      return null
    }

    const relativeDir = context.regexBasePath ? path.dirname(realPath).replace(context.regexBasePath, '') : path.dirname(realPath)
    const filePath = isRootFile ? path.dirname(context.pathPrefix) || '.' : path.join(context.pathPrefix, relativeDir || '.')

    return {
      id: stats.ino,
      path: filePath,
      name: fileName,
      mime: getMimeType(realPath, false),
      size: stats.size,
      mtime: stats.mtime.getTime(),
      realPath,
      extension
    }
  }

  private async buildFileContent(fileMetadata: FileContentMetadata): Promise<FileContent> {
    return {
      id: fileMetadata.id,
      path: fileMetadata.path,
      name: fileMetadata.name,
      mime: fileMetadata.mime,
      size: fileMetadata.size,
      mtime: fileMetadata.mtime,
      content: await this.parseContent(fileMetadata.realPath, fileMetadata.extension)
    }
  }

  private async parseContent(rPath: string, extension: string): Promise<string> {
    try {
      const content = await docTextify(
        rPath,
        {
          newlineDelimiter: ' ',
          minCharsToExtract: 10,
          ocrWorker: this.ocrManager?.worker
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
