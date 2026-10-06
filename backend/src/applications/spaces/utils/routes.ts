import { sanitizePath } from '../../files/utils/files.js'

export function PATH_TO_SPACE_SEGMENTS(path: string): string[] {
  return sanitizePath(path).split('/').filter(Boolean)
}
