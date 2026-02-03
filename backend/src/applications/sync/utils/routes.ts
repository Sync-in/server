import { PATH_TO_SPACE_SEGMENTS } from '../../spaces/utils/routes'
import { SYNC_PATH_REPOSITORY } from '../constants/sync'

export function SYNC_PATH_TO_SPACE_SEGMENTS(path: string): string[] {
  const urlSegments = PATH_TO_SPACE_SEGMENTS(path)
  const repository = urlSegments.shift()
  if (!(repository in SYNC_PATH_REPOSITORY)) {
    throw new Error(`Repository not found : ${repository}`)
  }
  urlSegments.unshift(...SYNC_PATH_REPOSITORY[repository])
  return urlSegments
}
