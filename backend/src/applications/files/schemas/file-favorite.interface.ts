import type { FileProps } from '../interfaces/file-props.interface'

export interface FileFavorite extends Pick<FileProps, 'id' | 'name' | 'isDir' | 'mime' | 'size' | 'mtime' | 'ctime'> {
  isFavorite: boolean
  navPath: string
}
