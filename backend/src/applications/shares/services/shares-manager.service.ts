/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import path from 'node:path'
import { ACTION } from '../../../common/constants'
import {
  anonymizePassword,
  convertDiffUpdate,
  diffCollection,
  differencePermissions,
  generateShortUUID,
  hashPassword
} from '../../../common/functions'
import type { Entries, StorageQuota } from '../../../common/interfaces'
import { intersectPermissions } from '../../../common/shared'
import { ContextManager } from '../../../infrastructure/context/services/context-manager.service'
import type { FileProps } from '../../files/interfaces/file-props.interface'
import { FileError } from '../../files/models/file-error'
import { checkExternalPath, dirSize, getProps, isPathExists } from '../../files/utils/files'
import { LINK_TYPE } from '../../links/constants/links'
import type { CreateOrUpdateLinkDto } from '../../links/dto/create-or-update-link.dto'
import type { LinkGuest } from '../../links/interfaces/link-guest.interface'
import type { Link } from '../../links/schemas/link.interface'
import { LinksQueries } from '../../links/services/links-queries.service'
import { NOTIFICATION_APP, NOTIFICATION_APP_EVENT } from '../../notifications/constants/notifications'
import type { NotificationContent, NotificationOptions } from '../../notifications/interfaces/notification-properties.interface'
import type { UserMailNotification } from '../../notifications/interfaces/user-mail-notification.interface'
import { NotificationsManager } from '../../notifications/services/notifications-manager.service'
import { CACHE_QUOTA_SHARE_PREFIX, CACHE_QUOTA_TTL } from '../../spaces/constants/cache'
import { SPACE_OPERATION, SPACE_PERMS_SEP, SPACE_REPOSITORY, SPACE_ROLE } from '../../spaces/constants/spaces'
import type { SpaceMemberDto } from '../../spaces/dto/create-or-update-space.dto'
import { SpaceEnv } from '../../spaces/models/space-env.model'
import type { SpaceProps } from '../../spaces/models/space-props.model'
import { SpacesQueries } from '../../spaces/services/spaces-queries.service'
import { havePermission, haveSpacePermission, removePermissions } from '../../spaces/utils/permissions'
import { MEMBER_TYPE } from '../../users/constants/member'
import { GUEST_PERMISSION, USER_NOTIFICATION, USER_ROLE } from '../../users/constants/user'
import { CreateUserDto } from '../../users/dto/create-or-update-user.dto'
import { UserModel } from '../../users/models/user.model'
import type { User } from '../../users/schemas/user.interface'
import { UsersQueries } from '../../users/services/users-queries.service'
import { SHARE_ALL_OPERATIONS, SHARE_TYPE } from '../constants/shares'
import type { CreateOrUpdateShareDto, ShareMemberDto } from '../dto/create-or-update-share.dto'
import type { ShareChildMember } from '../interfaces/share-child.interface'
import type { ShareEnv } from '../interfaces/share-env.interface'
import type { ShareFile } from '../interfaces/share-file.interface'
import type { ShareLink } from '../interfaces/share-link.interface'
import type { ShareProps } from '../interfaces/share-props.interface'
import type { ShareChild } from '../models/share-child.model'
import type { ShareMembers } from '../schemas/share-members.interface'
import type { Share } from '../schemas/share.interface'
import { SharesQueries } from './shares-queries.service'

@Injectable()
export class SharesManager {
  private readonly logger = new Logger(SharesManager.name)

  constructor(
    private readonly contextManager: ContextManager,
    private readonly notificationsManager: NotificationsManager,
    private readonly sharesQueries: SharesQueries,
    private readonly spacesQueries: SpacesQueries,
    private readonly usersQueries: UsersQueries,
    private readonly linksQueries: LinksQueries
  ) {}

  permissions(user: UserModel, spaceAlias: string) {
    return this.sharesQueries.permissions(user.id, spaceAlias, +user.isAdmin)
  }

  listShares(user: UserModel): Promise<ShareFile[]> {
    return this.sharesQueries.listShares(user)
  }

  listSpaceShares(spaceId: number): Promise<ShareChild[]> {
    return this.sharesQueries.listSpaceShares(spaceId)
  }

  listChildShares(user: UserModel, shareId: number): Promise<ShareChild[]> {
    return this.sharesQueries.listChildShares(user.id, shareId, +user.isAdmin)
  }

  async setAllowedPermissions(user: UserModel, share: ShareProps | ShareLink, asAdmin = false) {
    if (share.file?.ownerId === user.id || (share.externalPath && user.isAdmin)) {
      // current user is the file owner (personal space case)
      share.file.permissions = SHARE_ALL_OPERATIONS
    } else if (share.file?.space?.alias) {
      share.file.ownerId = null
      // retrieve space permissions (cached query)
      const spacePermissions: Partial<SpaceEnv> = await this.spacesQueries.permissions(user.id, share.file.space.alias, share.file.space.root?.alias)
      if (!spacePermissions) {
        this.logger.warn(`${this.setAllowedPermissions.name} - missing space permissions : ${JSON.stringify(share)}`)
        throw new HttpException('Space not found', HttpStatus.NOT_FOUND)
      }
      // compute permissions
      const spaceEnv = new SpaceEnv(spacePermissions)
      spaceEnv.setPermissions(true)
      share.file.permissions = spaceEnv.envPermissions
    } else if (share.parent?.alias) {
      // retrieve parent share permissions (cached query)
      // use current the user permissions on the share or the share owner permissions if we request the share as admin
      const userId = asAdmin ? share.ownerId : user.id
      const sharePermissions: Partial<SpaceEnv> = await this.sharesQueries.permissions(userId, share.parent.alias, +user.isAdmin)
      if (!sharePermissions) {
        this.logger.warn(`${this.setAllowedPermissions.name} - missing share permissions : ${JSON.stringify(share)}`)
        throw new HttpException('Share not found', HttpStatus.NOT_FOUND)
      }
      share.file.permissions = sharePermissions.permissions
    } else {
      this.logger.error(`${this.setAllowedPermissions.name} - case not handled ${JSON.stringify(share)}`)
      throw new HttpException('Missing information', HttpStatus.BAD_REQUEST)
    }
  }

  async getShareWithMembers(user: UserModel, shareId: number, asAdmin = false): Promise<ShareProps> {
    // asAdmin : true if the user is the owner of the parent share or if the share is requested from the administration
    const share: ShareProps = await this.sharesQueries.getShareWithMembers(user, shareId, asAdmin)
    if (!share) {
      throw new HttpException('Not authorized', HttpStatus.FORBIDDEN)
    }
    await this.setAllowedPermissions(user, share, asAdmin)
    return share
  }

  async createShare(user: UserModel, createOrUpdateShareDto: CreateOrUpdateShareDto): Promise<ShareProps> {
    const share: Partial<Share> = {
      name: createOrUpdateShareDto.name,
      alias: await this.sharesQueries.uniqueShareAlias(createOrUpdateShareDto.name),
      description: createOrUpdateShareDto.description,
      externalPath: createOrUpdateShareDto.externalPath,
      enabled: createOrUpdateShareDto.enabled,
      storageQuota: createOrUpdateShareDto.storageQuota,
      storageIndexing: createOrUpdateShareDto.storageIndexing,
      disabledAt: createOrUpdateShareDto.enabled ? null : new Date(),
      type: createOrUpdateShareDto.type || SHARE_TYPE.COMMON
    }
    if (share.externalPath) {
      /* EXTERNAL PATH CASE */
      if (!user.isAdmin) {
        throw new HttpException('Not authorized', HttpStatus.FORBIDDEN)
      }
      try {
        await checkExternalPath(share.externalPath)
      } catch (e: any) {
        throw new HttpException(e.message, e instanceof FileError ? e.httpCode : HttpStatus.INTERNAL_SERVER_ERROR)
      }
      share.ownerId = null
    } else {
      /* SPACES CASE */
      share.externalPath = null
      share.ownerId = user.id
      if (createOrUpdateShareDto.file.ownerId) {
        /* PERSONAL SPACE CASE */
        // check file
        if (createOrUpdateShareDto.file.ownerId === user.id && createOrUpdateShareDto.file.id > 0) {
          // When a user shares a root space they own, it is recommended to create the share from their personal space.
          // `file.path` come from a root space with a custom name (invalid in the personal space context); if so, retrieve the original path.
          const f = await this.spacesQueries.getUserFile(user.id, createOrUpdateShareDto.file.id)
          if (f) createOrUpdateShareDto.file.path = f.path
        }
        const realPath = path.join(user.filesPath, createOrUpdateShareDto.file.path)
        if (!(await isPathExists(realPath))) {
          this.logger.warn(`${this.createShare.name} - location does not exist : ${realPath}`)
          throw new HttpException('The location does not exist', HttpStatus.NOT_FOUND)
        }
        const fileProps: FileProps = { ...(await getProps(realPath, createOrUpdateShareDto.file.path)), id: createOrUpdateShareDto.file.id }
        share.fileId = await this.spacesQueries.getOrCreateUserFile(user.id, fileProps)
      } else if (createOrUpdateShareDto.file.space?.alias) {
        /* SPACE CASE */
        const spacePermissions: Partial<SpaceEnv> = await this.spacesQueries.permissions(
          user.id,
          createOrUpdateShareDto.file.space.alias,
          createOrUpdateShareDto.file.space.root.alias
        )
        if (!spacePermissions) {
          throw new HttpException('Space not found', HttpStatus.NOT_FOUND)
        }
        // compute space permissions
        const space: SpaceEnv = new SpaceEnv(spacePermissions)
        space.setPermissions(true)
        // intersect space permissions for members
        for (const m of createOrUpdateShareDto.members) {
          m.permissions = intersectPermissions(space.envPermissions, m.permissions)
        }
        // intersect space permissions for links
        for (const l of createOrUpdateShareDto.links) {
          l.permissions = intersectPermissions(space.envPermissions, l.permissions)
        }
        // check file
        try {
          space.setPaths(user, createOrUpdateShareDto.file.space.root.alias, createOrUpdateShareDto.file.path.split('/').slice(space.root.id ? 1 : 0))
        } catch (e) {
          if (e instanceof FileError) {
            throw new HttpException(e.message, e.httpCode)
          }
          throw new HttpException(e.message, HttpStatus.BAD_REQUEST)
        }
        if (!(await isPathExists(space.realPath))) {
          this.logger.warn(`${this.createShare.name} - space location does not exist : *${space.alias}* (${space.id}) : ${space.realPath}`)
          throw new HttpException('The location does not exist', HttpStatus.NOT_FOUND)
        }
        share.spaceId = space.id
        share.spaceRootId = space.root?.id || null
        // define share.fileId
        // if the file is the same as the space root, ignores share.fileId and only uses spaceId and spaceRootId
        const isExternalSpaceRoot =
          createOrUpdateShareDto.file?.id < 0 &&
          createOrUpdateShareDto.file?.path === createOrUpdateShareDto.file?.space?.root?.alias &&
          createOrUpdateShareDto.file?.space?.root?.alias === spacePermissions.root?.alias &&
          createOrUpdateShareDto.file?.space?.root?.name === spacePermissions.root?.name
        const isSpaceRoot = Number(createOrUpdateShareDto.file.id) === Number(spacePermissions.root?.file?.id)
        if (!isSpaceRoot && !isExternalSpaceRoot) {
          const fileProps: FileProps = { ...(await getProps(space.realPath, space.dbFile.path)), id: undefined }
          // get or create file id
          share.fileId = await this.spacesQueries.getOrCreateSpaceFile(createOrUpdateShareDto.file.id, fileProps, space.dbFile)
        }
      } else {
        // unexpected case
        throw new HttpException('Missing information', HttpStatus.BAD_REQUEST)
      }
    }
    // create share
    share.id = await this.sharesQueries.createShare(share)
    // check and update members
    await this.createOrUpdateLinksAsMembers(user, share, LINK_TYPE.SHARE, createOrUpdateShareDto.links)
    await this.updateMembers(user, share, [], createOrUpdateShareDto.members)
    return this.getShareWithMembers(user, share.id)
  }

  async updateShare(user: UserModel, shareId: number, createOrUpdateShareDto: CreateOrUpdateShareDto, asAdmin = false): Promise<ShareProps> {
    // asAdmin: true if the user is the owner of the parent share or if the share is requested from the administration
    const share: ShareProps = await this.getShareWithMembers(user, shareId, asAdmin)
    // check and update share info
    const shareDiffProps: Partial<ShareProps> = { modifiedAt: new Date() }
    const props: (keyof CreateOrUpdateShareDto)[] = ['name', 'description', 'enabled', 'storageQuota', 'storageIndexing']
    for (const prop of props) {
      if (createOrUpdateShareDto[prop] !== share[prop]) {
        shareDiffProps[prop] = createOrUpdateShareDto[prop]
        if (prop === 'name') {
          shareDiffProps.alias = await this.sharesQueries.uniqueShareAlias(shareDiffProps.name)
        } else if (prop === 'enabled') {
          shareDiffProps.disabledAt = shareDiffProps[prop] ? null : new Date()
        }
      }
    }
    // update in db
    if (!(await this.sharesQueries.updateShare(shareId, shareDiffProps))) {
      throw new HttpException('Unable to update share', HttpStatus.INTERNAL_SERVER_ERROR)
    }
    // check & update members
    const linkMembers: ShareMemberDto[] = await this.createOrUpdateLinksAsMembers(user, share, LINK_TYPE.SHARE, createOrUpdateShareDto.links)
    // intersect share permissions for members
    for (const m of createOrUpdateShareDto.members) {
      m.permissions = intersectPermissions(share.file.permissions, m.permissions)
    }
    // intersect share permissions for links
    for (const l of linkMembers) {
      l.permissions = intersectPermissions(share.file.permissions, l.permissions)
    }
    await this.updateMembers(user, share, share.members, [...createOrUpdateShareDto.members, ...linkMembers])
    return this.getShareWithMembers(user, share.id, asAdmin)
  }

  async deleteShare(user: UserModel, shareId: number, asAdmin = false): Promise<void> {
    // asAdmin : true if the user is the owner of the parent share or if the share is requested from an admin
    if (!asAdmin && !user.isAdmin && !(await this.sharesQueries.shareExistsForOwner(user.id, shareId))) {
      throw new HttpException('Not authorized', HttpStatus.FORBIDDEN)
    }
    try {
      await this.deleteAllLinkMembers(shareId, LINK_TYPE.SHARE)
      await this.removeShareFromOwners(shareId, 'all', false, user.id)
    } catch (e) {
      this.logger.error(`${this.deleteShare.name} - unable to delete share (${shareId}) (asAdmin = ${asAdmin}) : ${e}`)
      throw new HttpException('Unable to delete share', HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  async getChildShare(user: UserModel, shareId: number, childId: number, isLink?: false): Promise<ShareProps>
  async getChildShare(user: UserModel, shareId: number, childId: number, isLink?: true): Promise<ShareLink>
  async getChildShare(user: UserModel, shareId: number, childId: number, isLink?: boolean): Promise<ShareProps | ShareLink> {
    if (await this.checkChildSharePermissions(user, shareId, childId)) {
      if (isLink) {
        return this.getShareLink(user, childId, true)
      }
      return this.getShareWithMembers(user, childId, true)
    }
  }

  async updateChildShare(user: UserModel, shareId: number, childId: number, createOrUpdateShareDto: CreateOrUpdateShareDto): Promise<ShareProps> {
    if (await this.checkChildSharePermissions(user, shareId, childId)) {
      return this.updateShare(user, childId, createOrUpdateShareDto, true)
    }
  }

  async deleteChildShare(user: UserModel, shareId: number, childId: number): Promise<void> {
    if (await this.checkChildSharePermissions(user, shareId, childId)) {
      return this.deleteShare(user, childId, true)
    }
  }

  async createChildShare(user: UserModel, createOrUpdateShareDto: CreateOrUpdateShareDto): Promise<ShareProps> {
    // check parent share
    const pSharePermissions = await this.sharesQueries.permissions(user.id, createOrUpdateShareDto.parent.alias, +user.isAdmin)
    if (!pSharePermissions) {
      this.logger.warn(`${this.createChildShare.name} - parent share does not exist or not authorized : ${createOrUpdateShareDto.parent.alias}`)
      throw new HttpException('Parent share not found', HttpStatus.NOT_FOUND)
    }
    if (!haveSpacePermission(pSharePermissions, SPACE_OPERATION.SHARE_OUTSIDE)) {
      this.logger.warn(`${this.createChildShare.name} - is not allowed to share outside of : *${pSharePermissions.alias}* (${pSharePermissions.id})`)
      throw new HttpException('You are not allowed to do this action', HttpStatus.FORBIDDEN)
    }
    if (!pSharePermissions.enabled) {
      this.logger.warn(`${this.createChildShare.name} - parent share is disabled : ${createOrUpdateShareDto.parent.alias}`)
      throw new HttpException('Parent share is disabled', HttpStatus.FORBIDDEN)
    }

    let pShare: Partial<SpaceEnv>
    let filePath: string
    if (pSharePermissions.root.externalPath) {
      const highestParentId = await this.sharesQueries.findHighestParentShare(pSharePermissions.id)
      if (!highestParentId) {
        this.logger.warn(
          `${this.createChildShare.name} - unable to find the highest parent of : *${pSharePermissions.alias}* (${pSharePermissions.id})`
        )
        throw new HttpException('Parent share not found', HttpStatus.NOT_FOUND)
      }
      pShare = await this.sharesQueries.shareEnv(highestParentId)
      filePath = path.join(pSharePermissions.root?.file?.path || '', createOrUpdateShareDto.file.path)
    } else {
      pShare = await this.sharesQueries.shareEnv(pSharePermissions.id)
      filePath = createOrUpdateShareDto.file.path
    }

    // create a fake space env -> share env
    const pShareEnv: Partial<ShareEnv> = new SpaceEnv(pShare, null, false)
    try {
      pShareEnv.setPaths(user, null, filePath.split('/'))
    } catch (e) {
      if (e instanceof FileError) {
        throw new HttpException(e.message, e.httpCode)
      }
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST)
    }
    // check file
    if (!(await isPathExists(pShareEnv.realPath))) {
      this.logger.warn(
        `${this.createChildShare.name} - parent share location does not exist : ${pShareEnv.alias} (${pShareEnv.id}) : ${pShareEnv.realPath}`
      )
      throw new HttpException('The location does not exist', HttpStatus.NOT_FOUND)
    }

    /* Manage the case where the child share is created from the parent share itself */
    // special case, the parent share is directly linked to the space root file
    const isLinkedToShareSpaceRoot =
      pShareEnv.fileId === null &&
      Number(createOrUpdateShareDto.file.id) === Number(pSharePermissions.root?.id) &&
      createOrUpdateShareDto.file.path === '.'
    // special case, the parent share is directly linked to the share with an external path
    const isLinkedToShareExternalPath =
      createOrUpdateShareDto.file.id < 0 && !!pShareEnv.root.externalPath && createOrUpdateShareDto.file.path === '.'
    let fileId: number = null
    if (!isLinkedToShareSpaceRoot && !isLinkedToShareExternalPath) {
      // fileId is mandatory for a file in a child share
      const fileProps: FileProps = { ...(await getProps(pShareEnv.realPath, pShareEnv.dbFile.path)), id: undefined }
      fileId = await this.spacesQueries.getOrCreateSpaceFile(createOrUpdateShareDto.file.id, fileProps, pShareEnv.dbFile)
    }

    const share: Partial<Share> = {
      name: createOrUpdateShareDto.name,
      alias: await this.sharesQueries.uniqueShareAlias(createOrUpdateShareDto.name),
      ownerId: user.id,
      spaceId: pShareEnv.spaceId,
      spaceRootId: pShareEnv.spaceRootId,
      parentId: pSharePermissions.id,
      fileId: fileId,
      description: createOrUpdateShareDto.description,
      externalPath: pShareEnv.root.externalPath,
      enabled: createOrUpdateShareDto.enabled,
      disabledAt: createOrUpdateShareDto.enabled ? null : new Date(),
      type: createOrUpdateShareDto.type || SHARE_TYPE.COMMON
    }
    // create child share
    share.id = await this.sharesQueries.createShare(share)
    // intersect parent share permissions for members
    for (const m of createOrUpdateShareDto.members) {
      m.permissions = intersectPermissions(pSharePermissions.permissions, m.permissions)
    }
    // intersect parent share permissions for links
    for (const l of createOrUpdateShareDto.links) {
      l.permissions = intersectPermissions(pSharePermissions.permissions, l.permissions)
    }
    // check & update members
    await this.createOrUpdateLinksAsMembers(user, share, LINK_TYPE.SHARE, createOrUpdateShareDto.links)
    await this.updateMembers(user, share, [], createOrUpdateShareDto.members)
    return this.getShareWithMembers(user, share.id)
  }

  async updateSharesFromSpace(
    /*
      In this case the space is considered as a parent share
      The shares and child shares of the member should be deleted if the member is removed from the space
      Member permissions on shares and its child shares must be updated if the parent share owner's permissions are updated on the space
    */
    spaceId: number,
    currentMembers: SpaceMemberDto[],
    toRemove: SpaceMemberDto[],
    toUpdate: { object: SpaceMemberDto; rmPermissions: SPACE_OPERATION[] }[]
  ) {
    // skip if no actions
    if (!toRemove.length && !toUpdate.length) return
    // get all space manager ids (ignore them, they have all permissions on the space)
    const spaceManagerIds: number[] = currentMembers.filter((m) => m.spaceRole === SPACE_ROLE.IS_MANAGER).map((m) => m.id)
    const [rmOwners, upOwners] = await this.diffSharesPermissions(currentMembers, toRemove, toUpdate, spaceManagerIds)
    if (!rmOwners.length && !upOwners.length) return

    const owners: Record<
      number,
      {
        type: ACTION.UPDATE | ACTION.DELETE
        rmPermissions?: SPACE_OPERATION[]
      }
    > = {
      ...Object.fromEntries(rmOwners.map((uId: number) => [uId, { type: ACTION.DELETE }])),
      ...Object.fromEntries(
        upOwners.reduce(
          (
            acc: [
              number,
              {
                type: ACTION.UPDATE
                rmPermissions: SPACE_OPERATION[]
              }
            ][],
            o
          ) => {
            for (const id of o.ids) {
              acc.push([id, { type: ACTION.UPDATE, rmPermissions: o.rmPermissions }])
            }
            return acc
          },
          []
        )
      )
    }
    // find all parent shares which are owned by the modified/removed members of the space
    for (const share of await this.sharesQueries.selectParentSharesFromSpaceId(
      spaceId,
      Object.keys(owners).map((id: string) => parseInt(id))
    )) {
      if (share.ownerId in owners) {
        const action = owners[share.ownerId]
        if (action.type === ACTION.UPDATE) {
          this.removeChildSharesPermissions(
            share.id,
            [
              {
                ids: [share.ownerId],
                rmPermissions: action.rmPermissions
              }
            ],
            false
          ).catch((e: Error) => this.logger.error(`${this.updateSharesFromSpace.name} - ${e}`))
        } else {
          this.removeShareFromOwners(share.id, [share.ownerId], false).catch((e: Error) =>
            this.logger.error(`${this.updateSharesFromSpace.name} - ${e}`)
          )
        }
        this.logger.log(`${this.updateSharesFromSpace.name} - ${action.type} share (${share.id}) for owner ${share.ownerId} from space ${spaceId}`)
      }
    }
  }

  async updateSharesFromSpaceRoots(
    /* update or remove shares related to space roots changes */
    spaceId: number,
    toRemove: number[],
    toUpdate: {
      id: number
      rmPermissions: SPACE_OPERATION[]
    }[]
  ): Promise<void> {
    // skip if no actions
    if (!toRemove.length && !toUpdate.length) return

    for (const root of toUpdate) {
      for (const share of await this.sharesQueries.selectShares({ spaceId: spaceId, spaceRootId: root.id, parentId: null })) {
        this.removeChildSharesPermissions(
          share.id,
          [
            {
              ids: 'all',
              rmPermissions: root.rmPermissions
            }
          ],
          false
        ).catch((e: Error) => this.logger.error(`${this.updateSharesFromSpaceRoots.name} - ${e}`))
      }
    }

    for (const rootId of toRemove) {
      for (const share of await this.sharesQueries.selectShares({ spaceId: spaceId, spaceRootId: rootId, parentId: null })) {
        // use await ! avoid database lock ! next action is to delete the root space which is cascaded with share.spaceRootId
        await this.removeShareFromOwners(share.id, [share.ownerId], false)
      }
    }
  }

  async removeSharesFromSpace(spaceId: number): Promise<void> {
    for (const share of await this.sharesQueries.selectShares({ spaceId: spaceId, parentId: null })) {
      // use await ! avoid database lock ! next action is to delete the space which is cascaded with share.spaceId
      await this.removeShareFromOwners(share.id, [share.ownerId], false)
    }
  }

  async generateLinkUUID(userId: number): Promise<{ uuid: string }> {
    let uuid: string = generateShortUUID()
    while (!(await this.linksQueries.isUniqueUUID(userId, uuid))) {
      uuid = generateShortUUID()
    }
    return { uuid: uuid }
  }

  listShareLinks(user: UserModel): Promise<ShareLink[]> {
    return this.sharesQueries.listShareLinks(user)
  }

  async getShareLink(user: UserModel, shareId: number, asAdmin: boolean = false): Promise<ShareLink> {
    const shareLink: ShareLink = await this.sharesQueries.listShareLinks(user, shareId, asAdmin)
    if (!shareLink) {
      throw new HttpException('Not authorized', HttpStatus.FORBIDDEN)
    }
    await this.setAllowedPermissions(user, shareLink)
    if (shareLink.file?.permissions) {
      // share link does not have these permissions
      shareLink.file.permissions = removePermissions(shareLink.file.permissions, [SPACE_OPERATION.SHARE_INSIDE, SPACE_OPERATION.SHARE_OUTSIDE])
    }
    return shareLink
  }

  async getLinkFromSpaceOrShare(user: UserModel, linkId: number, spaceOrShareId: number, type: LINK_TYPE): Promise<LinkGuest> {
    let linkGuest: LinkGuest
    if (type === LINK_TYPE.SPACE) {
      linkGuest = await this.linksQueries.linkFromSpace(user.id, linkId, spaceOrShareId)
    } else {
      linkGuest = await this.linksQueries.linkFromShare(user.id, linkId, spaceOrShareId, +user.isAdmin)
    }
    if (!linkGuest) {
      this.logger.warn(`${this.getLinkFromSpaceOrShare.name} - unable to find link (${linkId}) on ${type} (${spaceOrShareId})`)
      throw new HttpException('Link not found', HttpStatus.NOT_FOUND)
    }
    return linkGuest
  }

  async createOrUpdateLinksAsMembers(
    user: UserModel,
    spaceOrShare: Partial<SpaceProps> | Partial<ShareProps>,
    type: LINK_TYPE,
    links: SpaceMemberDto[] | ShareMemberDto[]
  ): Promise<SpaceMemberDto[] | ShareMemberDto[]> {
    /* only used during the share creation from the share manager */
    const linkMembers: SpaceMemberDto[] | ShareMemberDto[] = []
    for (const link of links) {
      if (link.id < 0) {
        // new link (permissions are needed to create guest link)
        await this.createLinkFromSpaceOrShare(user, link.linkSettings.uuid, spaceOrShare.id, type, {
          ...link.linkSettings,
          permissions: link.permissions
        })
        // notify the guest link (if email is specified)
        this.notifyGuestLink(user, link, spaceOrShare.name, type === LINK_TYPE.SHARE ? ACTION.ADD : ACTION.UPDATE).catch((e: Error) =>
          this.logger.error(`${this.createOrUpdateLinksAsMembers.name} - ${e}`)
        )
      } else {
        if (link.linkSettings) {
          // modified link
          await this.updateLinkFromSpaceOrShare(user, link.linkId, spaceOrShare.id, type, link.linkSettings)
        }
        // unmodified link
        linkMembers.push(link)
      }
    }
    return linkMembers
  }

  async updateLinkFromSpaceOrShare(
    user: UserModel,
    linkId: number,
    spaceOrShareId: number,
    type: LINK_TYPE,
    createOrUpdateLinkDto: CreateOrUpdateLinkDto,
    fromAPI: boolean = false
  ): Promise<LinkGuest> {
    const link: LinkGuest = await this.getLinkFromSpaceOrShare(user, linkId, spaceOrShareId, type)
    if (!link) {
      this.logger.error(`${this.updateLinkFromSpaceOrShare.name} - (${linkId}) from ${type} (${spaceOrShareId}) and user (${user.id}) was not found`)
      throw new HttpException('Unable to find link', HttpStatus.NOT_FOUND)
    }
    const fieldsWhiteList: (keyof CreateOrUpdateLinkDto)[] = [
      'name',
      'email',
      'requireAuth',
      'limitAccess',
      'expiresAt',
      'language',
      'isActive',
      'password',
      'permissions',
      'shareName',
      'shareDescription'
    ]
    const [updateUser, updateLink, updateShare, updateMember]: [
      Partial<Pick<User, 'language' | 'isActive' | 'password'>>,
      Partial<Pick<Link, 'name' | 'email' | 'requireAuth' | 'limitAccess' | 'expiresAt'>>,
      Partial<Pick<Share, 'alias' | 'name' | 'description'>>,
      Partial<Pick<ShareMembers, 'permissions'>>
    ] = [{}, {}, {}, {}]
    for (const [k, v] of Object.entries(createOrUpdateLinkDto) as Entries<CreateOrUpdateLinkDto>) {
      if (fieldsWhiteList.indexOf(k) > -1 && link[k] !== v) {
        switch (k) {
          case 'password':
            if (v) {
              updateUser.password = await hashPassword(v)
            }
            break
          case 'permissions':
            if (fromAPI) {
              // permissions are only present if the share type is link
              // intersect permissions to ensure that the user does not attempt to exceed his rights
              const shareLink: ShareLink = await this.getShareLink(user, spaceOrShareId)
              updateMember.permissions = intersectPermissions(shareLink.file.permissions, v)
            }
            break
          case 'language':
            updateUser.language = v
            break
          case 'isActive':
            updateUser.isActive = v
            break
          case 'shareName':
            updateShare.name = v
            updateShare.alias = await this.sharesQueries.uniqueShareAlias(v)
            break
          case 'shareDescription':
            updateShare.description = v
            break
          case 'expiresAt':
            if (JSON.stringify(link[k]) !== JSON.stringify(v)) {
              updateLink[k] = v
            }
            break
          default:
            updateLink[k] = v
        }
      }
    }
    if (!Object.keys(updateUser).length && !Object.keys(updateLink).length && !Object.keys(updateShare).length && !Object.keys(updateMember).length) {
      this.logger.warn(`${this.updateLinkFromSpaceOrShare.name} - no diff to update`)
      return fromAPI ? link : null
    }
    try {
      await this.linksQueries.updateLinkFromSpaceOrShare(link, spaceOrShareId, updateUser, updateLink, updateShare, updateMember)
      this.logger.debug(
        `${this.updateLinkFromSpaceOrShare.name} - link (${linkId}) updated : ${JSON.stringify({
          ...{ user: anonymizePassword(updateUser) },
          ...{ link: updateLink },
          ...{ share: updateShare },
          ...{ member: updateMember }
        })}`
      )
    } catch (e) {
      this.logger.error(`${this.updateLinkFromSpaceOrShare.name} - ${e}`)
      throw new HttpException('Unable to update link', HttpStatus.INTERNAL_SERVER_ERROR)
    }
    if (fromAPI) {
      // for security reasons
      delete updateUser.password
      Object.assign(link, updateUser, updateLink, updateMember)
      return link
    }
  }

  async createGuestLink(
    permission: GUEST_PERMISSION.SPACES | GUEST_PERMISSION.SHARES,
    password?: string,
    language?: string,
    isActive: boolean = true
  ): Promise<Partial<User>> {
    const random = generateShortUUID(64)
    const guestLink = {
      login: random,
      email: `${random}@sync-in`,
      firstName: 'Guest',
      lastName: 'Link',
      language: language || null,
      permissions: permission,
      password: await hashPassword(password || generateShortUUID(24)),
      role: USER_ROLE.LINK,
      isActive: isActive
    } satisfies CreateUserDto
    try {
      ;(guestLink as Partial<User>).id = await this.usersQueries.createUserOrGuest(guestLink, USER_ROLE.LINK)
      return guestLink
    } catch (e) {
      this.logger.error(`${this.createGuestLink.name} - unable to create guest link : ${e}`)
      throw new HttpException('Unable to create guest link', HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  /* MANAGE SHARE LINKS */

  async deleteAllLinkMembers(spaceOrShareId: number, type: LINK_TYPE): Promise<void> {
    const ids: { id: number; linkId: number }[] = await this.linksQueries.allLinksFromSpaceOrShare(spaceOrShareId, type)
    await this.deleteGuestLinks(ids)
  }

  async deleteLinkMembers(members: SpaceMemberDto[] | ShareMemberDto[]): Promise<void> {
    await this.deleteGuestLinks(members)
  }

  async updateSharesExternalPathQuota(): Promise<void>
  async updateSharesExternalPathQuota(shareId: number): Promise<StorageQuota>
  async updateSharesExternalPathQuota(shareId?: number): Promise<void | StorageQuota> {
    for (const share of await this.sharesQueries.sharesQuotaExternalPaths(shareId)) {
      if (!(await isPathExists(share.externalPath))) {
        this.logger.warn(`${this.updateSharesExternalPathQuota.name} - *${share.alias}* home path does not exist`)
        continue
      }
      const [size, errors] = await dirSize(share.externalPath)
      for (const [path, error] of Object.entries(errors)) {
        this.logger.warn(`${this.updateSharesExternalPathQuota.name} - unable to get size for *${share.alias}* on ${path} : ${error}`)
      }
      const shareQuota: StorageQuota = { storageUsage: size, storageQuota: share.storageQuota }
      this.sharesQueries.cache
        .set(`${CACHE_QUOTA_SHARE_PREFIX}-${share.id}`, shareQuota, CACHE_QUOTA_TTL)
        .catch((e: Error) => this.logger.error(`${this.updateSharesExternalPathQuota.name} - share *${share.alias}* (${share.id}) : ${e}`))
      if (share.storageUsage !== shareQuota.storageUsage) {
        this.sharesQueries
          .updateShare(share.id, { storageUsage: shareQuota.storageUsage })
          .then(
            (updated: boolean) =>
              updated &&
              this.logger.log(
                `${this.updateSharesExternalPathQuota.name} - share *${share.alias}* (${share.id}) - storage usage updated : ${shareQuota.storageUsage}`
              )
          )
      }
      if (shareId) {
        return shareQuota
      }
    }
  }

  private async updateMembers(user: UserModel, share: Partial<Share>, oldMembers: ShareMemberDto[], currentMembers: ShareMemberDto[]) {
    if (oldMembers.length === 0 && currentMembers.length === 0) {
      return
    }
    // diff
    const [add, update, remove]: [ShareMemberDto[], Record<string | 'object', { old: any; new: any } | ShareMemberDto>[], ShareMemberDto[]] =
      diffCollection(oldMembers, currentMembers, ['permissions'], ['id', 'type'])

    // check members whitelists
    let toAdd: ShareMemberDto[] = []
    if (add.length) {
      const [userIdsWhitelist, groupIdsWhitelist] = await Promise.all([
        this.usersQueries.usersWhitelist(user.id),
        this.usersQueries.groupsWhitelist(user.id)
      ])
      toAdd = add.filter((m) => {
        if (
          ((m.type === MEMBER_TYPE.USER || m.type === MEMBER_TYPE.GUEST) && !m.linkId && userIdsWhitelist.indexOf(m.id) === -1) ||
          ((m.type === MEMBER_TYPE.GROUP || m.type === MEMBER_TYPE.PGROUP) && groupIdsWhitelist.indexOf(m.id) === -1)
        ) {
          this.logger.warn(
            `${this.updateMembers.name} cannot add ${m.type} (${m.id}) to share *${share.alias}* (${share.id}) : not in the members whitelist`
          )
          return false
        }
        return true
      })
    }

    // filter links
    const toRemove = remove.filter((m) => !m.linkId)
    // do remove links
    this.deleteLinkMembers(remove.filter((m) => !!m.linkId)).catch((e: Error) => this.logger.error(`${this.updateMembers.name} - ${e}`))
    // do update members
    const status: Record<
      Exclude<ACTION, ACTION.DELETE_PERMANENTLY>,
      {
        groupIds: number[]
        userIds: number[]
      }
    > = await this.sharesQueries.updateMembers(share.id, toAdd, convertDiffUpdate(update), toRemove)

    // lists deleted and updated members as potential share owners
    const [rmMembersChildShares, upMembersChildShares]: [ShareMemberDto[], { object: ShareMemberDto; rmPermissions: SPACE_OPERATION[] }[]] = [[], []]
    for (const [action, members] of Object.entries(status) as Entries<typeof status>) {
      if (!members.userIds.length && !members.groupIds.length) continue
      if (action === ACTION.DELETE) {
        // stores the removed members who might own child shares from the current share
        rmMembersChildShares.push(
          ...toRemove.filter(
            (m) =>
              ((m.type === MEMBER_TYPE.USER || m.type === MEMBER_TYPE.GUEST) && members.userIds.indexOf(m.id) > -1) ||
              ((m.type === MEMBER_TYPE.GROUP || m.type === MEMBER_TYPE.PGROUP) && members.groupIds.indexOf(m.id) > -1)
          )
        )
      } else if (action === ACTION.UPDATE) {
        // stores permissions updates and members who might own child shares created from the current share
        for (const m of update as { object: ShareMemberDto; permissions: { old: string; new: string } }[]) {
          if (
            ((m.object.type === MEMBER_TYPE.USER || m.object.type === MEMBER_TYPE.GUEST) && members.userIds.indexOf(m.object.id) > -1) ||
            ((m.object.type === MEMBER_TYPE.GROUP || m.object.type === MEMBER_TYPE.PGROUP) && members.groupIds.indexOf(m.object.id) > -1)
          ) {
            const diffPermissions = differencePermissions(m.permissions.old, m.permissions.new) as SPACE_OPERATION[]
            if (diffPermissions.length) {
              upMembersChildShares.push({ object: m.object, rmPermissions: diffPermissions })
            }
          }
        }
      }

      // clear cache &|| notify
      this.onShareActionForMembers(share, action, members, user).catch((e: Error) => this.logger.error(`${this.updateMembers.name} - ${e}`))
    }

    // do updates
    // remove or update potential child shares
    this.updateMembersChildSharesPermissions(share.id, currentMembers, rmMembersChildShares, upMembersChildShares).catch((e: Error) =>
      this.logger.error(`${this.updateMembers.name} - ${e}`)
    )
  }

  private async updateMembersChildSharesPermissions(
    parentShareId: number,
    currentMembers: ShareMemberDto[],
    toRemove: ShareMemberDto[],
    toUpdate: { object: ShareMemberDto; rmPermissions: SPACE_OPERATION[] }[]
  ) {
    /*
      child shares of the member should be deleted if the member is removed from the parent share
      the permissions of the child shares members should be updated if the member's permissions are updated
    */
    const [removeUsersChildShares, updateUsersChildShares] = await this.diffSharesPermissions(currentMembers, toRemove, toUpdate)
    await Promise.all([
      this.removeShareFromOwners(parentShareId, removeUsersChildShares),
      this.removeChildSharesPermissions(parentShareId, updateUsersChildShares)
    ])
  }

  private async diffSharesPermissions(
    currentMembers: ShareMemberDto[] | SpaceMemberDto[],
    toRemove: ShareMemberDto[] | SpaceMemberDto[],
    toUpdate: { object: ShareMemberDto | SpaceMemberDto; rmPermissions: SPACE_OPERATION[] }[],
    ignoreUserIds: number[] = []
  ): Promise<[number[], { ids: number[]; rmPermissions: SPACE_OPERATION[] }[]]> {
    // remove shares from members
    const [removeUsersChildShares, removeGroupsChildShares]: number[][] = [[], []]
    for (const m of toRemove) {
      if (m.type === MEMBER_TYPE.USER || m.type === MEMBER_TYPE.GUEST) {
        if (ignoreUserIds.indexOf(m.id) > -1) {
          continue
        }
        // do not remove child shares if the user is a member of a group with share permission
        const memberGroupIds = await this.usersQueries.groupsWhitelist(m.id)
        const groupSharePermission = currentMembers.find(
          (m) =>
            (m.type === MEMBER_TYPE.GROUP || m.type === MEMBER_TYPE.PGROUP) &&
            memberGroupIds.indexOf(m.id) > -1 &&
            havePermission(m.permissions, SPACE_OPERATION.SHARE_OUTSIDE)
        )
        if (groupSharePermission) {
          this.logger.debug(
            `${this.diffSharesPermissions.name} - ignore user (${m.id}) removal : is a member of the group (${groupSharePermission.id}) with share permission`
          )
          continue
        }
        removeUsersChildShares.push(m.id)
      } else {
        removeGroupsChildShares.push(m.id)
      }
    }

    // update shares permissions from members
    const [updateUsersChildShares, updateGroupsChildShares]: { ids: number[]; rmPermissions: SPACE_OPERATION[] }[][] = [[], []]
    for (const m of toUpdate) {
      // all child share permissions must be updated
      if (m.object.type === MEMBER_TYPE.USER || m.object.type === MEMBER_TYPE.GUEST) {
        if (ignoreUserIds.indexOf(m.object.id) > -1) continue
        // check if the user is a member of the existing groups on the share
        // since group and user permissions are aggregated, we should check the group permissions
        const memberGroupIds = await this.usersQueries.groupsWhitelist(m.object.id)
        const groupPermissions = currentMembers
          .filter((m) => (m.type === MEMBER_TYPE.GROUP || m.type === MEMBER_TYPE.PGROUP) && memberGroupIds.indexOf(m.id) > -1)
          .reduce((perms: string[], m: ShareMemberDto) => {
            for (const p of m.permissions.split(SPACE_PERMS_SEP).filter((p: string) => p !== '' && perms.indexOf(p) === -1)) {
              perms.push(p)
            }
            return perms
          }, [])
        // find all permissions that the user must keep
        const [permsToKeep, permsToRemove]: SPACE_OPERATION[][] = [[], []]
        // compare the permissions removed from group to user's
        m.rmPermissions.forEach((p: SPACE_OPERATION) => (groupPermissions.indexOf(p) > -1 ? permsToKeep.push(p) : permsToRemove.push(p)))
        if (!permsToRemove.length) {
          // the groups provide these permissions to user, no need to update child shares
          continue
        }
        // remove only unmatched permissions
        m.rmPermissions = permsToRemove
      }
      // group members by permissions to optimize queries
      const memberTypeChildShares =
        m.object.type === MEMBER_TYPE.USER || m.object.type === MEMBER_TYPE.GUEST ? updateUsersChildShares : updateGroupsChildShares
      const memberWithSamePermissions = memberTypeChildShares.find((p) => p.rmPermissions.toString() === m.rmPermissions.toString())
      if (memberWithSamePermissions) {
        memberWithSamePermissions.ids.push(m.object.id)
      } else {
        memberTypeChildShares.push({ ids: [m.object.id], rmPermissions: m.rmPermissions })
      }
    }

    // retrieves all users from groups and subgroups & add them to the remove and update lists
    if (removeGroupsChildShares.length) {
      // ignore user id if the user is already removed or is a member of the parent share
      const rmUsersFromGroups = (await this.usersQueries.allUserIdsFromGroupsAndSubGroups(removeGroupsChildShares)).filter(
        (id) =>
          ignoreUserIds.indexOf(id) === -1 &&
          removeUsersChildShares.indexOf(id) === -1 &&
          !currentMembers.find((m) => (m.type === MEMBER_TYPE.USER || m.type === MEMBER_TYPE.GUEST) && m.id === id)
      )
      removeUsersChildShares.push(...rmUsersFromGroups)
    }
    if (updateGroupsChildShares.length) {
      for (const g of updateGroupsChildShares) {
        // ignore user id if the user is already removed or is a member of the parent share
        const rmUsersPermissionsFromGroups: number[] = []
        for (const uId of await this.usersQueries.allUserIdsFromGroupsAndSubGroups(g.ids)) {
          if (ignoreUserIds.indexOf(uId) > -1 || removeUsersChildShares.indexOf(uId) > -1) {
            continue
          }
          // check if the user is a member of the existing groups on the share
          // since group and user permissions are aggregated, we should check the group permissions
          const memberGroupIds = await this.usersQueries.groupsWhitelist(uId)
          const groupPermissions = currentMembers
            .filter(
              (m) =>
                ((m.type === MEMBER_TYPE.GROUP || m.type === MEMBER_TYPE.PGROUP) && memberGroupIds.indexOf(m.id) > -1) ||
                ((m.type === MEMBER_TYPE.USER || m.type === MEMBER_TYPE.GUEST) && m.id === uId)
            )
            .reduce((perms: string[], m: ShareMemberDto) => {
              for (const p of m.permissions.split(SPACE_PERMS_SEP).filter((p: string) => p !== '' && perms.indexOf(p) === -1)) {
                perms.push(p)
              }
              return perms
            }, [])
          // find all permissions that the user must keep
          const [permsToKeep, permsToRemove]: SPACE_OPERATION[][] = [[], []]
          // compare the permissions removed from group to user's
          g.rmPermissions.forEach((p: SPACE_OPERATION) => (groupPermissions.indexOf(p) > -1 ? permsToKeep.push(p) : permsToRemove.push(p)))
          if (!permsToKeep.length) {
            // user does not have the removed permissions from groups or from himself, we can remove the permissions to his child shares
            rmUsersPermissionsFromGroups.push(uId)
          } else if (permsToRemove.length) {
            // remove only unmatched permissions
            updateUsersChildShares.push({ ids: [uId], rmPermissions: permsToRemove })
          }
        }
        if (!rmUsersPermissionsFromGroups.length) continue
        // group users by permissions to optimize queries
        const memberWithSamePermissions = updateUsersChildShares.find((p) => p.rmPermissions.toString() === g.rmPermissions.toString())
        if (memberWithSamePermissions) {
          memberWithSamePermissions.ids.push(...rmUsersPermissionsFromGroups)
        } else {
          updateUsersChildShares.push({ ids: rmUsersPermissionsFromGroups, rmPermissions: g.rmPermissions })
        }
      }
    }
    return [removeUsersChildShares, updateUsersChildShares]
  }

  private async removeShareFromOwners(shareId: number, ownerIds: number[] | 'all', asParent: boolean = true, fromUserId?: number) {
    // deletes only the first (child) shares, child shares will be deleted in cascade
    const where = { ...(asParent ? { parentId: shareId } : { id: shareId }), ...(ownerIds !== 'all' && { ownerId: ownerIds }) }
    for (const share of await this.sharesQueries.selectShares(where)) {
      try {
        // store current child shares members before delete parent share
        const members: ShareChildMember[] = await this.sharesQueries.membersFromChildSharesPermissions(share.id, [share.ownerId], null, false)
        await this.sharesQueries.deleteShare(share.id)
        this.logger.log(`${this.removeShareFromOwners.name} - share *${share.alias}* (${share.id}) from owner (${share.ownerId}) was removed`)
        // clear cache and notify users
        if (share.ownerId && (!fromUserId || fromUserId !== share.ownerId)) {
          this.clearCachePermissionsAndOrNotify(share, ACTION.DELETE_PERMANENTLY, [share.ownerId]).catch((e: Error) =>
            this.logger.error(`${this.removeShareFromOwners.name} - ${e}`)
          )
        }
        members.forEach((m) => this.clearCachePermissionsAndOrNotify({ alias: m.shareAlias, name: m.shareName }, ACTION.DELETE, [m.userId]))
      } catch (e) {
        this.logger.error(
          `${this.removeShareFromOwners.name} - share *${share.alias}* (${share.id}) from owner (${share.ownerId}) was not removed : ${e}`
        )
      }
    }
  }

  private async removeChildSharesPermissions(
    shareId: number,
    userPermissions: {
      ids: number[] | 'all'
      rmPermissions: SPACE_OPERATION[]
    }[],
    asParent: boolean = true
  ) {
    // remove permissions of all members of the child shares
    if (!userPermissions.length) return
    for (const userPerm of userPermissions) {
      const members: ShareChildMember[] = await this.sharesQueries.membersFromChildSharesPermissions(
        shareId,
        userPerm.ids,
        userPerm.rmPermissions.join('|'),
        asParent
      )
      for (const m of members) {
        const permissions = removePermissions(m.userPermissions, userPerm.rmPermissions)
        try {
          await this.sharesQueries.updateMember({ permissions: permissions }, { id: m.id })
          this.clearCachePermissionsAndOrNotify(
            {
              alias: m.shareAlias,
              name: m.shareName
            },
            ACTION.UPDATE,
            [m.userId]
          ).catch((e: Error) => this.logger.error(`${this.removeChildSharesPermissions.name} - ${e}`))
          this.logger.log(
            `${this.removeChildSharesPermissions.name} - user (${m.id}) permissions ${JSON.stringify(userPerm.rmPermissions)} on share : ${m.shareAlias} (${m.shareId}) was removed`
          )
        } catch (e) {
          this.logger.error(
            `${this.removeChildSharesPermissions.name} - user (${m.id}) permissions on share *${m.shareAlias}* (${m.shareId}) was not removed : ${e}`
          )
        }
      }
    }
  }

  private async checkChildSharePermissions(user: UserModel, shareId: number, childId: number): Promise<boolean> {
    const isOwnerForChildShare: number = await this.sharesQueries.childExistsForShareOwner(user.id, shareId, childId, user.isAdmin)
    if (isOwnerForChildShare !== childId) {
      this.logger.warn(`${this.checkChildSharePermissions.name} - is not allowed to manage child share (${childId}) from share (${shareId})`)
      throw new HttpException('Not authorized', HttpStatus.FORBIDDEN)
    }
    return true
  }

  private async onShareActionForMembers(share: Partial<Share>, action: ACTION, members: { groupIds: number[]; userIds: number[] }, user?: UserModel) {
    this.clearCachePermissionsAndOrNotify(
      share,
      action,
      Array.from(new Set([...(await this.usersQueries.allUserIdsFromGroupsAndSubGroups(members.groupIds)), ...members.userIds])).filter(
        (uid) => uid !== user?.id
      ),
      user
    ).catch((e: Error) => this.logger.error(`${this.onShareActionForMembers.name} - ${e}`))
  }

  private async createLinkFromSpaceOrShare(
    user: UserModel,
    uuid: string,
    spaceOrShareId: number,
    type: LINK_TYPE,
    createOrUpdateLinkDto: CreateOrUpdateLinkDto
  ): Promise<void> {
    /* only used during the share creation from this manager */
    if (!(await this.linksQueries.isReservedUUID(user.id, uuid))) {
      this.logger.error(`${this.createLinkFromSpaceOrShare.name} - user attempted to use UUID (${uuid}) was not reserved`)
      throw new HttpException('UUID was not reserved', HttpStatus.BAD_REQUEST)
    }
    const permission = type === LINK_TYPE.SPACE ? GUEST_PERMISSION.SPACES : GUEST_PERMISSION.SHARES
    const guestLink: Partial<User> = await this.createGuestLink(
      permission,
      createOrUpdateLinkDto.password,
      createOrUpdateLinkDto.language,
      createOrUpdateLinkDto.isActive !== undefined ? createOrUpdateLinkDto.isActive : true
    )
    this.logger.debug(`${this.createLinkFromSpaceOrShare.name} - guest link (${guestLink.id}) created`)
    let linkId: number
    try {
      linkId = await this.linksQueries.createLinkToSpaceOrShare(guestLink.id, spaceOrShareId, type, {
        ...createOrUpdateLinkDto,
        uuid: uuid,
        userId: guestLink.id
      })
      this.logger.debug(
        `${this.createLinkFromSpaceOrShare.name} - link (${linkId}) for guest link (${guestLink.id}) created : ${JSON.stringify(createOrUpdateLinkDto)}`
      )
    } catch (e) {
      this.logger.error(`${this.createLinkFromSpaceOrShare.name} - unable to create link with uuid (${uuid}) : ${e}`)
      throw new HttpException('Unable to update link', HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  private async deleteGuestLinks(guestLinks: Partial<{ id: number; linkId: number }>[]) {
    for (const guestLink of guestLinks) {
      try {
        await this.usersQueries.deleteGuestLink(guestLink.id)
        this.logger.log(`${this.deleteGuestLinks.name} - guest (${guestLink.id}) (link: ${guestLink.linkId}) was removed`)
      } catch (e) {
        this.logger.error(`${this.deleteGuestLinks.name} - guest (${guestLink.id}) (link: ${guestLink.linkId}) was not removed : ${e}`)
      }
    }
  }

  /* MANAGE CACHE PERMISSIONS AND NOTIFY */

  private async clearCachePermissionsAndOrNotify(share: Partial<Share>, action: ACTION, memberIds: number[], user?: UserModel): Promise<void> {
    if (!memberIds?.length) {
      return
    }
    this.logger.verbose(`${this.clearCachePermissionsAndOrNotify.name} - share:${share.alias} ${action} members:${JSON.stringify(memberIds)}`)
    if (action !== ACTION.ADD) {
      // clear permissions for share members
      this.sharesQueries
        .clearCachePermissions(share.alias, memberIds)
        .catch((e: Error) => this.logger.error(`${this.clearCachePermissionsAndOrNotify.name} - ${e}`))
    }
    if (action !== ACTION.UPDATE) {
      // notify the members who have joined or left the share
      const notification: NotificationContent = {
        app: NOTIFICATION_APP.SHARES,
        event: user ? NOTIFICATION_APP_EVENT.SHARES[action] : NOTIFICATION_APP_EVENT.SHARES_WITHOUT_OWNER[action],
        element: share.name,
        url: SPACE_REPOSITORY.SHARES
      }
      this.notificationsManager
        .create(memberIds, notification, {
          currentUrl: this.contextManager.headerOriginUrl(),
          author: user,
          action: action
        })
        .catch((e: Error) => this.logger.error(`${this.clearCachePermissionsAndOrNotify.name} - ${e}`))
    }
  }

  private async notifyGuestLink(user: UserModel, link: SpaceMemberDto | ShareMemberDto, spaceOrShareName: string, action: ACTION) {
    if (!link.linkSettings.email) {
      return
    }
    this.notificationsManager
      .sendEmailNotification(
        [
          {
            id: -1,
            email: link.linkSettings.email,
            language: link.linkSettings.language,
            notification: USER_NOTIFICATION.APPLICATION_EMAIL
          } satisfies UserMailNotification
        ],
        {
          app: NOTIFICATION_APP.LINKS,
          event: NOTIFICATION_APP_EVENT.LINKS[action],
          element: spaceOrShareName,
          url: null
        } satisfies NotificationContent,
        {
          author: user,
          linkUUID: link.linkSettings.uuid,
          linkPassword: link.linkSettings.password,
          currentUrl: this.contextManager.headerOriginUrl(),
          action: action
        } satisfies NotificationOptions
      )
      .catch((e: Error) => this.logger.error(`${this.notifyGuestLink.name} - ${e}`))
  }
}
