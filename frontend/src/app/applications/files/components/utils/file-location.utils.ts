import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { FILE_REPOSITORY } from '@sync-in-server/backend/src/applications/files/constants/operations'
import { SPACE_ALIAS, SPACE_REPOSITORY } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import { SPACES_ICON, SPACES_TITLE } from '../../../spaces/spaces.constants'

export type FileLocationRepository = SPACE_ALIAS.PERSONAL | FILE_REPOSITORY.SPACE | FILE_REPOSITORY.SHARE

export interface FileLocationPresentation {
  repository: FileLocationRepository
  repositoryTitle: string
  relativePath: string
  icon: IconDefinition
  iconClass: 'primary' | 'purple'
}

interface FileLocationOptions {
  repository?: FileLocationRepository
  appendName?: string
  excludeLeaf?: boolean
  displayRootName?: string
}

const FILE_LOCATION_PRESENTATION: Record<FileLocationRepository, Pick<FileLocationPresentation, 'repositoryTitle' | 'icon' | 'iconClass'>> = {
  [SPACE_ALIAS.PERSONAL]: {
    repositoryTitle: SPACES_TITLE.PERSONAL_SPACE,
    icon: SPACES_ICON.PERSONAL,
    iconClass: 'primary'
  },
  [FILE_REPOSITORY.SPACE]: { repositoryTitle: SPACES_TITLE.COLLABORATIVE_SPACES, icon: SPACES_ICON.SPACES, iconClass: 'primary' },
  [FILE_REPOSITORY.SHARE]: { repositoryTitle: SPACES_TITLE.SHARES, icon: SPACES_ICON.SHARES, iconClass: 'purple' }
}

export function resolveFileLocation(path: string, options: FileLocationOptions & { repository: FileLocationRepository }): FileLocationPresentation
export function resolveFileLocation(path: string, options?: FileLocationOptions): FileLocationPresentation | undefined
export function resolveFileLocation(path: string, options: FileLocationOptions = {}): FileLocationPresentation | undefined {
  const segments = path?.split('/').filter(Boolean) || []
  const repository = options.repository || inferRepository(segments)
  if (!repository) return undefined
  const relativeSegments = segments.slice(segments[1] === SPACE_ALIAS.PERSONAL ? 2 : segments.length ? 1 : 0)
  if (options.excludeLeaf) relativeSegments.pop()
  if (repository !== SPACE_ALIAS.PERSONAL && options.displayRootName && relativeSegments.length) relativeSegments[0] = options.displayRootName
  if (options.appendName) relativeSegments.push(options.appendName)
  return {
    repository,
    relativePath: relativeSegments.join('/'),
    ...FILE_LOCATION_PRESENTATION[repository]
  }
}

function inferRepository(segments: string[]): FileLocationRepository | undefined {
  if (segments[0] === SPACE_REPOSITORY.SHARES) return FILE_REPOSITORY.SHARE
  if (segments[0] === SPACE_ALIAS.PERSONAL || segments[1] === SPACE_ALIAS.PERSONAL) return SPACE_ALIAS.PERSONAL
  if (segments[0] === SPACE_ALIAS.SPACES || segments[0] === SPACE_REPOSITORY.FILES || segments[0] === SPACE_REPOSITORY.TRASH) {
    return FILE_REPOSITORY.SPACE
  }
  return undefined
}
