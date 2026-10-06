import type { SpaceEnv } from '../../spaces/models/space-env.model.js'
import type { UserModel } from '../../users/models/user.model.js'
import type { FileTask } from '../models/file-task.js'

export interface FileTaskQueueItem {
  cacheKey: string
  dto: any
  method: string
  space: SpaceEnv
  task: FileTask
  user: UserModel
}

export type FileTaskQueueStarter = (task: FileTaskQueueItem) => Promise<boolean>

export interface FileTaskQueueEntry {
  task: FileTaskQueueItem
  startTask: FileTaskQueueStarter
}
