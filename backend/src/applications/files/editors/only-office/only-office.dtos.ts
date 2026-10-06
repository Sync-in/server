import type { FileLockProps } from '../../interfaces/file-props.interface.js'
import type { OnlyOfficeConfig } from './only-office.interface.js'

export interface OnlyOfficeReqDto {
  documentServerUrl: string
  config: OnlyOfficeConfig
  hasLock: false | FileLockProps
}
