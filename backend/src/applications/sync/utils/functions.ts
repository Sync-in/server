import { BadRequestException } from '@nestjs/common'
import path from 'node:path'
import safeRegex from 'safe-regex2'
import { SYNC_FILE_NAME_PREFIX } from '../constants/sync'

const MAX_PATH_FILTER_LENGTH = 200
const MAX_PATH_FILTER_REPETITIONS = 25

export function getTmpFilePath(rPath: string): string {
  return `${path.dirname(rPath)}/${SYNC_FILE_NAME_PREFIX}${path.basename(rPath)}`
}

export function transformPathFilters(value: unknown): RegExp | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null
  }

  if (value.length > MAX_PATH_FILTER_LENGTH) {
    throw new BadRequestException('Path filter pattern is too long')
  }

  let pathFilter: RegExp
  try {
    pathFilter = new RegExp(value, 'i')
  } catch {
    throw new BadRequestException('Invalid path filter pattern')
  }

  if (!safeRegex(pathFilter, { limit: MAX_PATH_FILTER_REPETITIONS })) {
    throw new BadRequestException('Unsafe path filter pattern')
  }

  return pathFilter
}
