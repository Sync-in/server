import { sanitizePath } from '../../files/utils/files'

export function PATH_TO_SPACE_SEGMENTS(path: string): string[] {
  return sanitizePath(path).split('/').filter(Boolean)
}
