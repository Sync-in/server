import { FileContent, FileContentRecordMetadataMap } from '../schemas/file-content.interface'

export abstract class FilesContentStore {
  abstract indexesCount(): Promise<number>

  abstract indexesList(): Promise<string[]>

  abstract getIndexName(indexSuffix: string): string

  abstract existingIndexes(indexSuffixes: string[]): Promise<string[]>

  abstract createIndex(indexName: string): Promise<boolean>

  abstract dropIndex(indexName: string): Promise<boolean>

  abstract insertRecord(indexName: string, fc: FileContent, runId: string): Promise<boolean>

  abstract searchRecords(indexNames: string[], search: string, limit: number): Promise<FileContent[]>

  abstract getRecordMetadataByIds(indexName: string, ids: number[]): Promise<FileContentRecordMetadataMap>

  abstract markRecordsSeen(indexName: string, ids: number[], runId: string): Promise<boolean>

  abstract deleteRecords(indexName: string, ids: number[]): Promise<void>

  abstract deleteUnseenRecords(indexName: string, runId: string): Promise<number>

  abstract cleanIndexes(indexSuffixes: string[]): Promise<void>

  abstract dropAllIndexes(): Promise<void>
}
