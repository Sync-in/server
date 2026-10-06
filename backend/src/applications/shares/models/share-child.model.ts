import { popFromObject } from '../../../common/shared.js'
import type { Owner } from '../../users/interfaces/owner.interface.js'
import type { ShareChildQuery } from '../interfaces/share-child.interface.js'
import type { Share } from '../schemas/share.interface.js'

export class ShareChild implements Pick<Share, 'id' | 'parentId' | 'type' | 'name' | 'alias'> {
  id: number
  parentId: number
  type: number
  name: string
  alias: string
  owner: Owner
  file: { mime: string }

  constructor(props: ShareChildQuery) {
    this.owner = props.ownerLogin
      ? {
          login: popFromObject('ownerLogin', props),
          fullName: popFromObject('ownerFullName', props),
          email: popFromObject('ownerEmail', props)
        }
      : null
    this.file = props.fileMime ? { mime: popFromObject('fileMime', props) } : null
    Object.assign(this, props)
  }
}
