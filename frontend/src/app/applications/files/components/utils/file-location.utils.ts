import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { SPACE_ALIAS, SPACE_REPOSITORY } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import { SPACES_ICON } from '../../../spaces/spaces.constants'

type FileLocationRepository = 'personal' | 'space' | 'share'

interface FileLocationPresentation {
  repository: FileLocationRepository
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

const FILE_LOCATION_PRESENTATION: Record<FileLocationRepository, Pick<FileLocationPresentation, 'icon' | 'iconClass'>> = {
  personal: { icon: SPACES_ICON.PERSONAL, iconClass: 'primary' },
  space: { icon: SPACES_ICON.SPACES, iconClass: 'primary' },
  share: { icon: SPACES_ICON.SHARES, iconClass: 'purple' }
}

export function resolveFileLocation(path: string, options: FileLocationOptions & { repository: FileLocationRepository }): FileLocationPresentation
export function resolveFileLocation(path: string, options?: FileLocationOptions): FileLocationPresentation | undefined
export function resolveFileLocation(path: string, options: FileLocationOptions = {}): FileLocationPresentation | undefined {
  const segments = path?.split('/').filter(Boolean) || []
  const repository = options.repository || inferRepository(segments)
  if (!repository) return undefined
  const relativeSegments = segments.slice(segments[1] === SPACE_ALIAS.PERSONAL ? 2 : segments.length ? 1 : 0)
  if (options.excludeLeaf) relativeSegments.pop()
  if (repository !== 'personal' && options.displayRootName && relativeSegments.length) relativeSegments[0] = options.displayRootName
  if (options.appendName) relativeSegments.push(options.appendName)
  return {
    repository,
    relativePath: relativeSegments.join('/'),
    ...FILE_LOCATION_PRESENTATION[repository]
  }
}

function inferRepository(segments: string[]): FileLocationRepository | undefined {
  if (segments[0] === SPACE_REPOSITORY.SHARES) return 'share'
  if (segments[0] === SPACE_ALIAS.PERSONAL || segments[1] === SPACE_ALIAS.PERSONAL) return 'personal'
  if (segments[0] === SPACE_ALIAS.SPACES || segments[0] === SPACE_REPOSITORY.FILES || segments[0] === SPACE_REPOSITORY.TRASH) {
    return 'space'
  }
  return undefined
}
