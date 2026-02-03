import { SpaceEnv } from '../../spaces/models/space-env.model'

export interface ShareEnv extends Partial<SpaceEnv> {
  fileId: number
  spaceId: number
  spaceRootId: number
  inSharesRepository: boolean
}
