import { uniquePermissions } from '../../../common/functions'
import { FileDBProps } from '../../files/interfaces/file-db-props.interface'
import { FileTaskProps } from '../../files/models/file-task'
import { UserModel } from '../../users/models/user.model'
import { SPACE_ALIAS, SPACE_ALL_OPERATIONS, SPACE_OPERATION, SPACE_PERMS_SEP, SPACE_REPOSITORY, SPACE_ROLE } from '../constants/spaces'
import { Space } from '../schemas/space.interface'
import { dbFileFromSpace, realPathFromSpace } from '../utils/paths'
import { getEnvPermissions, removePermissions } from '../utils/permissions'

export class SpaceEnv implements Pick<Space, 'id' | 'alias' | 'name' | 'enabled'> {
  /* the space environment determines the context of access, permissions and the targeted resource */
  id: number
  alias: string
  name: string
  enabled: boolean = true
  // space or share permissions
  permissions: string
  role: SPACE_ROLE
  repository: SPACE_REPOSITORY
  // in share case the root is the file of the share
  root?: {
    // if the id equal to 0, the root is located inside the space (not in the user files)
    // in share case, the id is equal to the file id
    id: number
    alias: string
    name: string
    // root space permissions
    permissions: string
    // root owner (file owner)
    owner?: { id: number; login: string }
    // root.externalPath or share.externalPath
    externalPath?: string
    // in share case, if defined, it's an external child share with a parent
    externalParentShareId?: number
    file?: {
      // space and root are only used when the space is a share
      id: number
      path: string
      inTrash: boolean
      space?: { id: number; alias: string }
      root?: { id: number; externalPath: string }
    }
  }
  paths?: string[]

  // computed properties
  url: string
  relativeUrl: string
  realPath: string
  realBasePath: string
  dbFile: FileDBProps
  // merged permissions from space and root
  envPermissions: string
  // states
  inFilesRepository = false
  inTrashRepository = false
  inSharesRepository = false
  inPersonalSpace = false
  inSharesList = false
  // quota
  storageUsage: number
  storageQuota: number
  quotaIsExceeded = false
  // event
  task?: { cacheKey: string; props: FileTaskProps }

  constructor(props: Partial<SpaceEnv>, rootAlias = '', mustHaveRoot = true) {
    Object.assign(this, props)
    if (mustHaveRoot && (this.root?.id === null || this.root?.id === undefined)) {
      /* The root is a resource located inside the space but not anchored, this is why we set the id to 0 and the permissions are inherited */
      this.root = { id: 0, alias: rootAlias, name: rootAlias, permissions: this.permissions }
    }
    this.quotaIsExceeded = this.storageQuota !== null && this.storageUsage >= this.storageQuota
  }

  setup(user: UserModel, repository: SPACE_REPOSITORY, rootAlias: string, paths: string[], urlSegments: string[], skipEndpointProtection = false) {
    // Ordering is important here
    this.setRepository(repository)
    this.setPaths(user, rootAlias, paths)
    this.setPermissions(skipEndpointProtection)
    this.setUrls(urlSegments)
  }

  setPermissions(skipEndpointProtection = false) {
    if (this.role === SPACE_ROLE.IS_MANAGER) {
      /* If the user or the user groups have a manger role in this space, allow all permissions on space (but not on root) */
      this.permissions = SPACE_ALL_OPERATIONS
    } else {
      /* The permissions are not unique since they can come from several user groups */
      this.permissions = uniquePermissions(this.permissions)
    }
    if (this.inPersonalSpace) {
      /* The user space must have all rights when a no anchored root is targeted  */
      this.permissions = SPACE_ALL_OPERATIONS
    }
    /* If no root was anchored inherits from space permissions */
    if (this.root?.id === 0) {
      this.root.permissions = this.permissions
    }
    /* If we are in a root space, we have to intersect the space & the root permissions */
    this.envPermissions = getEnvPermissions(this, this.root)
    /* Protects against the deletion of virtual endpoints */
    if (!skipEndpointProtection && this.envPermissions.indexOf(SPACE_OPERATION.DELETE) > -1) {
      if ((this.inFilesRepository || this.inTrashRepository) && !this.paths.length && (this.root?.id || (!this.root?.id && !this.root?.alias))) {
        /* Protects the spaces : /spaces/space_alias || /trash/space_alias */
        /* Protects the root spaces : /spaces/space_alias/root_anchored */
        this.envPermissions = removePermissions(this.envPermissions, [SPACE_OPERATION.DELETE])
      } else if (this.inSharesRepository && !this.paths.length && (this.root?.id || this.root?.externalPath)) {
        /* Protects the shares to be deleted by the users : shares/share_alias */
        this.envPermissions = removePermissions(this.envPermissions, [SPACE_OPERATION.DELETE])
      }
    }
  }

  setPaths(user: UserModel, rootAlias: string, paths: string[]) {
    this.paths = this.inSharesRepository && rootAlias ? [rootAlias, ...paths] : paths
    if (!this.inSharesList) {
      // realPathFromSpace may throw a FileError exception
      ;[this.realBasePath, this.realPath] = realPathFromSpace(user, this, true)
      this.dbFile = dbFileFromSpace(user.id, this)
    }
  }

  browsePermissions(): string {
    const permissions = getEnvPermissions(this, this.root)
    if (this.inPersonalSpace) {
      return permissions
        .split(SPACE_PERMS_SEP)
        .filter((p: string) => p !== SPACE_OPERATION.SHARE_INSIDE)
        .join(SPACE_PERMS_SEP)
    } else {
      return permissions
    }
  }

  willExceedQuota(contentLength: number): boolean {
    if (this.storageQuota) {
      return contentLength > this.storageQuota - this.storageUsage
    }
    return false
  }

  private setRepository(repository: SPACE_REPOSITORY) {
    this.repository = repository
    this.inFilesRepository = repository === SPACE_REPOSITORY.FILES
    this.inTrashRepository = repository === SPACE_REPOSITORY.TRASH
    this.inSharesRepository = repository === SPACE_REPOSITORY.SHARES
    this.inSharesList = this.inSharesRepository && this.id === 0
    this.inPersonalSpace = this.alias === SPACE_ALIAS.PERSONAL
  }

  private setUrls(urlSegments: string[]) {
    this.url = urlSegments.join('/')
    this.relativeUrl = urlSegments.length <= 2 ? '.' : urlSegments.slice(2).join('/')
  }
}
