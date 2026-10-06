import { SyncDiffDto } from '../../sync/dtos/sync-operations.dto.js'

export interface ParseDiffContext {
  regexBasePath: RegExp
  syncDiff: SyncDiffDto
}
