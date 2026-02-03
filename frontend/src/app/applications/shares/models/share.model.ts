import type { FileSpace } from '@sync-in-server/backend/src/applications/files/interfaces/file-space.interface'
import { SHARE_ALL_OPERATIONS } from '@sync-in-server/backend/src/applications/shares/constants/shares'
import type { ShareProps } from '@sync-in-server/backend/src/applications/shares/interfaces/share-props.interface'
import { SPACE_OPERATION, SPACE_PERMS_SEP } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import type { Member } from '@sync-in-server/backend/src/applications/users/interfaces/member.interface'
import { popFromObject } from '@sync-in-server/backend/src/common/shared'
import { defaultMimeUrl } from '../../files/files.constants'
import { SPACES_PERMISSIONS_TEXT } from '../../spaces/spaces.constants'
import { setTextIconPermissions } from '../../spaces/spaces.functions'
import { MemberModel } from '../../users/models/member.model'
import { setMimeUrl } from '../shares.functions'

export class ShareModel implements ShareProps {
  id: number
  ownerId: number
  alias: string
  name: string
  description: string
  enabled: boolean
  externalPath: string
  storageUsage: number
  storageQuota: number
  storageIndexing: boolean
  createdAt: Date
  modifiedAt: Date
  disabledAt: Date
  parent: { id: number; ownerId: number; alias: string; name: string }
  file: FileSpace

  // extra properties
  mimeUrl: string
  members: MemberModel[] = []
  links: MemberModel[] = []
  hPerms: Partial<typeof SPACES_PERMISSIONS_TEXT> = {}

  constructor(share: Partial<ShareProps>) {
    this.setMembers(popFromObject('members', share), !!share.externalPath || share.file?.isDir ? [SPACE_OPERATION.SHARE_INSIDE] : [])
    Object.assign(this, share)
    setMimeUrl(this)
    this.checkFile()
    this.setPermissions()
  }

  fallBackMimeUrl() {
    this.mimeUrl = defaultMimeUrl
  }

  private setMembers(members: Member[], omitPermissions: SPACE_OPERATION[]) {
    if (!members) return
    for (const m of members) {
      if (m.linkId) {
        this.links.push(new MemberModel(m, [...omitPermissions, SPACE_OPERATION.SHARE_OUTSIDE]))
      } else {
        this.members.push(new MemberModel(m, omitPermissions))
      }
    }
  }

  private checkFile() {
    if (this.file) {
      if (!this.file.path && this.file.space.root?.name) {
        // external space roots case
        this.file.path = this.file.space.root.name
        this.file.name = this.file.space.root.name
      }
      if (this.file.permissions) {
        // removes share inside permission (not necessary for shares)
        // removes add and delete permissions if the file is not a directory
        this.file.permissions = this.file.permissions
          .split(SPACE_PERMS_SEP)
          .filter((p: string) => {
            if (p === SPACE_OPERATION.SHARE_INSIDE) return false
            else if (p === SPACE_OPERATION.ADD && this.file.id && !this.file.isDir) return false
            else if (p === SPACE_OPERATION.DELETE && this.file.id && !this.file.isDir) return false
            return true
          })
          .join(SPACE_PERMS_SEP)
      }
    }
  }

  private setPermissions() {
    if (typeof this.file?.permissions === 'string') {
      this.hPerms = setTextIconPermissions(this.file.permissions)
    } else if (this.externalPath) {
      this.hPerms = setTextIconPermissions(SHARE_ALL_OPERATIONS)
    }
  }
}
