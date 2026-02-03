import type { FileProps } from '../../files/interfaces/file-props.interface'
import type { Owner } from '../../users/interfaces/owner.interface'
import type { SpaceRoot } from '../schemas/space-root.interface'

export class SpaceRootProps implements Partial<SpaceRoot> {
  id: number
  alias: string
  name: string
  permissions: string
  createdAt?: Date
  externalPath?: string
  owner?: Owner | any
  file: FileProps | any
}
