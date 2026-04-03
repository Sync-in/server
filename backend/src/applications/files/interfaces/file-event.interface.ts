import type { SpaceEnv } from '../../spaces/models/space-env.model'
import type { FILE_OPERATION } from '../constants/operations'
import type { ACTION } from '../../../common/constants'
import type { UserModel } from '../../users/models/user.model'

export interface FileTaskEventEmit {
  startWatch: [space: SpaceEnv, taskType: FILE_OPERATION, rPath: string]
}

export interface FileEventType {
  user: UserModel
  space: SpaceEnv
  action: ACTION
  rPath: string
  oriPath?: string // src from copy/move operations
}

export interface FileEventEmit {
  event: [event: FileEventType]
}
