import type { SpaceEnv } from '../../spaces/models/space-env.model.js'
import type { ACTION } from '../../../common/constants.js'
import type { UserModel } from '../../users/models/user.model.js'

export interface FileTaskEventEmit {
  startWatch: [space: SpaceEnv, rPath: string]
}

export interface FileEventType {
  user: UserModel
  space: SpaceEnv
  action: ACTION
  rPath: string
  source?: 'editor'
}

export interface FileEventEmit {
  event: [event: FileEventType]
}
