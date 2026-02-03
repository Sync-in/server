import { SyncDiffDto } from '../../sync/dtos/sync-operations.dto'

export interface ParseDiffContext {
  regexBasePath: RegExp
  syncDiff: SyncDiffDto
}
