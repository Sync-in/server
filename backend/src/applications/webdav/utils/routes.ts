import { PATH_TO_SPACE_SEGMENTS } from '../../spaces/utils/routes.js'
import { WEBDAV_BASE_PATH, WEBDAV_SPACES } from '../constants/routes.js'

export function WEBDAV_PATH_TO_SPACE_SEGMENTS(path: string): string[] {
  const urlSegments = PATH_TO_SPACE_SEGMENTS(path)
  if (urlSegments[0] === WEBDAV_BASE_PATH) {
    urlSegments.shift()
  }
  const repository = urlSegments.shift()
  if (!((repository as string) in WEBDAV_SPACES)) {
    throw new Error(`Repository not found : ${repository}`)
  }
  urlSegments.unshift(...WEBDAV_SPACES[repository as keyof typeof WEBDAV_SPACES].spaceRepository!)
  return urlSegments
}
