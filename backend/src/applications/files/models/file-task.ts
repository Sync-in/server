import { FILE_OPERATION } from '../constants/operations'

export enum FileTaskStatus {
  PENDING,
  SUCCESS,
  ERROR
}

export interface FileTaskProps {
  progress?: number
  size?: number
  totalSize?: number
  compressInDirectory?: boolean
  directories?: number
  files?: number
  src?: { name: string; path: string }
}

export class FileTask {
  id: string
  type: FILE_OPERATION
  status: FileTaskStatus
  path: string
  name: string
  props: FileTaskProps = {}
  result: string
  startedAt: number
  endedAt: number

  constructor(id: string, type: FILE_OPERATION, path: string, name: string) {
    this.id = id
    this.type = type
    this.path = path
    this.name = name
    if (type === FILE_OPERATION.COPY || type === FILE_OPERATION.MOVE || type === FILE_OPERATION.DOWNLOAD) {
      this.props = { progress: 1 }
      if (type !== FILE_OPERATION.DOWNLOAD) {
        // copy move operation
        this.props.src = { name: name, path: path }
      }
    }
  }
}
