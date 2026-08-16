import type { FileDBProps } from '../../files/interfaces/file-db-props.interface'

export interface SpaceTrash {
  id: number
  name: string
  alias: string
  enabled: boolean
  mtime: number
  ctime: number
  nb: number
}

export interface TrashTarget {
  dbScope: Omit<FileDBProps, 'path'>
  mode: 'trash'
  path: string
  temporaryRoot: string
}

export interface PermanentDeleteTarget {
  mode: 'permanent'
  reason: 'external-share'
}

export type TrashTargetResolution = TrashTarget | PermanentDeleteTarget
