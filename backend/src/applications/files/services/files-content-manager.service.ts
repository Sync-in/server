/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Injectable, Logger } from '@nestjs/common'
import fs from 'fs/promises'
import { Stats } from 'node:fs'
import path from 'node:path'
import { indexableExtensions, shareIndexPrefix, spaceIndexPrefix, userIndexPrefix } from '../constants/indexing'
import { FileIndexContext, FileParseContext } from '../interfaces/file-parse-index'
import { FilesIndexer } from '../models/files-indexer'
import { FileContent } from '../schemas/file-content.interface'
import { docTextify } from '../utils/doc-textify/doc-textify'
import { getMimeType } from '../utils/files'
import { FilesParser } from './files-parser.service'

@Injectable()
export class FilesContentManager {
  private readonly maxDocumentSize = 150 * 1_000_000
  private readonly logger = new Logger(FilesContentManager.name)

  constructor(
    private readonly filesIndexer: FilesIndexer,
    private readonly filesParser: FilesParser
  ) {}

  async parseAndIndexAllFiles(): Promise<void> {
    const indexSuffixes: string[] = []
    for await (const [id, type, paths] of this.filesParser.allPaths()) {
      let indexSuffix: string
      switch (type) {
        case 'user':
          indexSuffix = `${userIndexPrefix}${id}`
          break
        case 'space':
          indexSuffix = `${spaceIndexPrefix}${id}`
          break
        case 'share':
          indexSuffix = `${shareIndexPrefix}${id}`
      }
      try {
        await this.indexFiles(indexSuffix, paths)
      } catch (e) {
        this.logger.error(`${this.parseAndIndexAllFiles.name} : ${e}`)
      }
      indexSuffixes.push(indexSuffix)
    }
    // clean up old tables
    await this.filesIndexer.cleanIndexes(indexSuffixes)
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
            this.logger.error(`${this.indexFiles.name} - ${indexSuffix} | ${rootFileContent.name} : ${e}`)
          })
          indexedRecords++
        }
        continue
      }
      for await (const fileContent of this.parseFiles(p.realPath, context)) {
        this.filesIndexer.insertRecord(indexName, fileContent).catch((e: Error) => {
          errorRecords++
          this.logger.error(`${this.indexFiles.name} - ${indexSuffix} | ${fileContent.name} : ${e}`)
        })
        indexedRecords++
      }
    }

    if (context.db.size === 0 && indexedRecords === 0) {
      // case when no data
      this.filesIndexer
        .dropIndex(indexName)
        .catch((e: Error) => this.logger.error(`${this.indexFiles.name} - ${indexSuffix} - unable to drop index : ${e}`))
      this.logger.log(`${this.indexFiles.name} - ${indexSuffix} - no data, index not stored`)
    } else {
      // clean up old records
      const recordsToDelete: number[] = [...context.db.keys()].filter((key) => !context.fs.has(key))
      if (recordsToDelete.length > 0) {
        this.filesIndexer
          .deleteRecords(indexName, recordsToDelete)
          .catch((e: Error) => this.logger.error(`${this.indexFiles.name} - ${indexSuffix} - unable to delete records : ${e}`))
      }
      if (indexedRecords === 0 && errorRecords === 0 && recordsToDelete.length === 0) {
        this.logger.log(`${this.indexFiles.name} - ${indexSuffix} - no new data`)
      } else {
        this.logger.log(
          `${this.indexFiles.name} - ${indexSuffix} - indexed: ${indexedRecords - errorRecords}, errors: ${errorRecords}, deleted: ${recordsToDelete.length}`
        )
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
        const fileContent = await this.analyzeFile(realPath, context)
        if (fileContent !== null) {
          yield fileContent
        }
      }
    } catch (e) {
      this.logger.warn(`${this.parseFiles.name} - ${context.indexSuffix} - unable to parse : ${dir} : ${e}`)
    }
  }

  private async analyzeFile(realPath: string, context: FileIndexContext, isRootFile = false): Promise<FileContent> {
    const extension = path.extname(realPath).slice(1).toLowerCase()
    if (!indexableExtensions.has(extension)) return null

    const fileName = isRootFile ? path.basename(context.pathPrefix) : path.basename(realPath)

    // ignore temporary documents
    if (fileName.startsWith('~$')) return null

    let stats: Stats
    try {
      stats = await fs.stat(realPath)
    } catch (e) {
      this.logger.warn(`${this.analyzeFile.name} - unable to stats ${realPath} : ${e}`)
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
        { newlineDelimiter: ' ', minCharsToExtract: 10 },
        {
          extension: extension,
          verified: true
        }
      )
      return content.length ? content : null
    } catch (e) {
      this.logger.warn(`${this.parseContent.name} - unable to index : ${rPath} : ${e}`)
    }
    return null
  }
}
