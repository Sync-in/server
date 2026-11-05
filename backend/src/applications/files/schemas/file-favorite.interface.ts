import { SPACE_ALIAS } from '../../spaces/constants/spaces.js'
import { FILE_REPOSITORY } from '../constants/operations.js'
import type { FileProps } from '../interfaces/file-props.interface.js'

export type FileFavoriteRepository = SPACE_ALIAS.PERSONAL | FILE_REPOSITORY.SPACE | FILE_REPOSITORY.SHARE

export interface FileFavorite extends FileProps {
  fileId: number
  createdAt: Date
  isDisabled: boolean
  // `path` contains the logical parent location when the file remains accessible.
  repository?: FileFavoriteRepository
  displayRootName?: string
  // Canonical browser path used to resolve and open an accessible favorite; null when no location is available.
  targetPath: string | null
}

export interface FileFavoriteLocation {
  fileId: number
  repository: FileFavoriteRepository
  path: string
  name: string
  displayRootName?: string
  targetPath: string
  contextId: number
  rootId: number
}

export type FileFavoriteIdentity = Pick<FileFavorite, 'fileId'>
