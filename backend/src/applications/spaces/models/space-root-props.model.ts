import type { FileProps } from '../../files/interfaces/file-props.interface.js'
import type { Owner } from '../../users/interfaces/owner.interface.js'

export interface SpaceRootProps {
  id: number
  alias: string
  name: string
  permissions: string
  createdAt?: Date
  externalPath?: string | null
  owner?: Owner | any
  file: FileProps | any
}
