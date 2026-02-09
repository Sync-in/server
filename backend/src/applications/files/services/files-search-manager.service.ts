import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import fs from 'fs/promises'
import { Stats } from 'node:fs'
import path from 'node:path'
import { configuration } from '../../../configuration/config.environment'
import { SharesQueries } from '../../shares/services/shares-queries.service'
import { SpacesQueries } from '../../spaces/services/spaces-queries.service'
import { UserModel } from '../../users/models/user.model'
import { shareIndexPrefix, spaceIndexPrefix, userIndexPrefix } from '../constants/indexing'
import { SearchFilesDto } from '../dto/file-operations.dto'
import { FilesIndexer } from '../models/files-indexer'
import { FileContent } from '../schemas/file-content.interface'
import { dirName, fileName, getMimeType } from '../utils/files'
import { genRegexPositiveAndNegativeTerms } from '../utils/files-search'
import { FilesParser } from './files-parser.service'

@Injectable()
export class FilesSearchManager {
  private readonly logger = new Logger(FilesSearchManager.name)

  constructor(
    private readonly filesIndexer: FilesIndexer,
    private readonly filesParser: FilesParser,
    private readonly spacesQueries: SpacesQueries,
    private readonly sharesQueries: SharesQueries
  ) {}

  async search(user: UserModel, search: SearchFilesDto): Promise<FileContent[]> {
    const [spaceIds, shareIds] = await Promise.all([this.spacesQueries.spaceIds(user.id), this.sharesQueries.shareIds(user.id, +user.isAdmin)])
    if (search.fullText) {
      if (!configuration.applications.files.contentIndexing) {
        throw new HttpException('Full-text search is disabled', HttpStatus.BAD_REQUEST)
      }
      return await this.searchFullText(user.id, spaceIds, shareIds, search.content, search.limit)
    } else {
      return await this.searchFileNames(user.id, spaceIds, shareIds, search.content, search.limit)
    }
  }

  private async searchFullText(userId: number, spaceIds: number[], shareIds: number[], search: string, limit: number): Promise<FileContent[]> {
    const indexNames = await this.filesIndexer.existingIndexes([
      `${userIndexPrefix}${userId}`,
      ...spaceIds.map((id) => `${spaceIndexPrefix}${id}`),
      ...shareIds.map((id) => `${shareIndexPrefix}${id}`)
    ])
    if (indexNames.length === 0) {
      return []
    }
    try {
      return await this.filesIndexer.searchRecords(indexNames, search, limit)
    } catch (e) {
      this.logger.error({ tag: this.searchFullText.name, msg: `${JSON.stringify(indexNames)} - ${search} : ${e}` })
      let msg: string
      if (/Invalid regular expression/.test(e.message)) {
        msg = 'SyntaxError (check special characters)'
      } else {
        msg = e.message
      }
      throw new HttpException(msg, HttpStatus.BAD_REQUEST)
    }
  }

  private async searchFileNames(userId: number, spaceIds: number[], shareIds: number[], search: string, limit: number): Promise<FileContent[]> {
    const fileContents: FileContent[] = []
    const regexpTerms = genRegexPositiveAndNegativeTerms(search)
    for await (const [_id, _type, paths] of this.filesParser.allPaths(userId, spaceIds, shareIds)) {
      for (const p of paths) {
        const regexBasePath = new RegExp(`^/?${p.realPath}/?`)
        if (!p.isDir) {
          const f = await this.analyzeFile(p.realPath, p.pathPrefix, regexBasePath, regexpTerms)
          if (f !== null) {
            fileContents.push(f)
          }
          continue
        }
        for await (const fileContent of this.parseFileNames(p.realPath, p.pathPrefix, regexBasePath, regexpTerms)) {
          fileContents.push(fileContent)
          if (fileContents.length >= limit) {
            return fileContents
          }
        }
      }
    }
    return fileContents
  }

  private async *parseFileNames(dir: string, pathPrefix: string, regexBasePath: RegExp, regexpTerms: RegExp): AsyncGenerator<FileContent> {
    try {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const realPath = path.join(entry.parentPath, entry.name)
        const fileContent = await this.analyzeFile(realPath, pathPrefix, regexBasePath, regexpTerms)
        if (fileContent !== null) {
          yield fileContent
        }
        if (entry.isDirectory()) {
          yield* this.parseFileNames(realPath, pathPrefix, regexBasePath, regexpTerms)
        }
      }
    } catch (e) {
      this.logger.warn({ tag: this.parseFileNames.name, msg: `unable to parse: ${dir} (${e})` })
    }
  }

  private async analyzeFile(realPath: string, pathPrefix: string, regexBasePath: RegExp, regexpTerms: RegExp): Promise<FileContent> {
    const filePath = realPath.replace(regexBasePath, '')
    if (!regexpTerms.test(filePath)) return null
    const stats: Stats = await fs.stat(realPath)
    return {
      id: stats.ino,
      path: path.join(pathPrefix, dirName(filePath)),
      name: fileName(filePath),
      mime: getMimeType(realPath, stats.isDirectory()),
      size: stats.size,
      mtime: stats.mtime.getTime()
    }
  }
}
