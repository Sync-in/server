import type { LucideIcon } from '@lucide/angular'
import { FILE_REPOSITORY } from '@sync-in-server/backend/src/applications/files/constants/operations'
import { SPACE_ALIAS } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'

export type FileLocationRepository = SPACE_ALIAS.PERSONAL | FILE_REPOSITORY.SPACE | FILE_REPOSITORY.SHARE

export interface FileLocationDisplay {
  icon?: LucideIcon
  iconClass: 'primary' | 'purple'
  showedPath?: string
  repositoryTitle?: string
  displayRootName?: string
  inTrash?: boolean | number
}

export interface FileLocationPresentation {
  repository: FileLocationRepository
  repositoryTitle: string
  relativePath: string
  icon: LucideIcon
  iconClass: 'primary' | 'purple'
}

export interface FileLocationOptions {
  repository?: FileLocationRepository
  appendName?: string
  excludeLeaf?: boolean
  displayRootName?: string
}

export interface FileLocationProps {
  id: number
  path: string
  name: string
  mime: string
  mtime: number
  isDir?: boolean
  inTrash?: boolean
  displayRootName?: string
}
