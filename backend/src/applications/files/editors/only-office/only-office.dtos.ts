import type { FileLockProps } from '../../interfaces/file-props.interface'
import type { OnlyOfficeConfig } from './only-office.interface'

export interface OnlyOfficeReqDto {
  documentServerUrl: string
  config: OnlyOfficeConfig
  hasLock: false | FileLockProps
}
