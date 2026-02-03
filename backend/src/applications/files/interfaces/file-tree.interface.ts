import type { FileProps } from './file-props.interface'

export interface FileTree extends Pick<FileProps, 'id' | 'name' | 'path' | 'isDir' | 'mime'> {
  hasChildren: boolean
  inShare: boolean
  enabled: boolean
  permissions: string
  quotaIsExceeded: boolean
}
