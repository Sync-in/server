import path from 'node:path'
import { SYNC_FILE_NAME_PREFIX } from '../constants/sync'

export function getTmpFilePath(rPath: string): string {
  return `${path.dirname(rPath)}/${SYNC_FILE_NAME_PREFIX}${path.basename(rPath)}`
}
