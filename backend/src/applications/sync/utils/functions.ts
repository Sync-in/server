import { BadRequestException, Logger } from '@nestjs/common'
import path from 'node:path'
import { SYNC_TEMPORARY_FILE_PREFIX } from '../constants/sync.js'
import { PathFilterError } from './path-filters/errors.js'
import { compilePathFilters } from './path-filters/path-filter-compiler.js'
import { SYNC_MAX_PATH_FILTER_LENGTH, SYNC_MAX_PATH_FILTER_WARNINGS } from './path-filters/constants.js'
import type { SyncPathFilterMatcher } from './path-filters/path-filter-compiler.interface.js'

const pathFilterLogger = new Logger('SyncPathFilters')

export function getSyncTmpFilePath(rPath: string): string {
  return `${path.dirname(rPath)}/${SYNC_TEMPORARY_FILE_PREFIX}${path.basename(rPath)}`
}

export function transformPathFilters(value: unknown): SyncPathFilterMatcher | null {
  if (typeof value !== 'string' || value === '') {
    return null
  }

  try {
    const result = compilePathFilters(value)
    for (const rejection of result.rejected.slice(0, SYNC_MAX_PATH_FILTER_WARNINGS)) {
      pathFilterLogger.warn({
        msg: 'Ignoring path filter alternative',
        index: rejection.index,
        pattern: rejection.pattern.slice(0, SYNC_MAX_PATH_FILTER_LENGTH),
        reason: rejection.reason
      })
    }
    if (result.rejected.length > SYNC_MAX_PATH_FILTER_WARNINGS) {
      pathFilterLogger.warn({
        msg: 'Additional path filter alternatives ignored',
        count: result.rejected.length - SYNC_MAX_PATH_FILTER_WARNINGS
      })
    }
    return result.matcher
  } catch (error) {
    if (error instanceof PathFilterError) {
      throw new BadRequestException(error.message)
    }
    throw error
  }
}
