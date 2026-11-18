import { sanitizePath } from '../../files/core/utils/files.js'

export function PATH_TO_SPACE_SEGMENTS(path: string): string[] {
  return sanitizePath(path).split('/').filter(Boolean)
}
