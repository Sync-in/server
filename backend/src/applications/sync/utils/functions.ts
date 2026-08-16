import { BadRequestException } from '@nestjs/common'
import path from 'node:path'
import safeRegex from 'safe-regex2'
import { SYNC_MAX_PATH_FILTER_PATTERN_LENGTH, SYNC_MAX_PATH_FILTER_REPETITIONS, SYNC_TEMPORARY_FILE_PREFIX } from '../constants/sync'

export function getSyncTmpFilePath(rPath: string): string {
  return `${path.dirname(rPath)}/${SYNC_TEMPORARY_FILE_PREFIX}${path.basename(rPath)}`
}

export function transformPathFilters(value: unknown): RegExp | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null
  }

  if (value.length > SYNC_MAX_PATH_FILTER_PATTERN_LENGTH) {
    throw new BadRequestException('Path filter pattern is too long')
  }

  let pathFilter: RegExp
  try {
    pathFilter = new RegExp(value, 'i')
  } catch {
    throw new BadRequestException('Invalid path filter pattern')
  }

  if (!safeRegex(pathFilter, { limit: SYNC_MAX_PATH_FILTER_REPETITIONS })) {
    throw new BadRequestException('Unsafe path filter pattern')
  }

  return pathFilter
}
