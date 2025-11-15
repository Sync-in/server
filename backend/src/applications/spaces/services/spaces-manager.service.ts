/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { eq, isNotNull, lte } from 'drizzle-orm'
import fs from 'node:fs/promises'
import path from 'node:path'
import { ACTION } from '../../../common/constants'
import { convertDiffUpdate, diffCollection, differencePermissions } from '../../../common/functions'
import type { Entries, StorageQuota } from '../../../common/interfaces'
import { createSlug, regExpNumberSuffix } from '../../../common/shared'
import { configuration } from '../../../configuration/config.environment'
import { ContextManager } from '../../../infrastructure/context/services/context-manager.service'
import { FileError } from '../../files/models/file-error'
import { dirListFileNames, dirSize, getProps, isPathExists, moveFiles, removeFiles } from '../../files/utils/files'
import { LINK_TYPE } from '../../links/constants/links'
import { NOTIFICATION_APP, NOTIFICATION_APP_EVENT } from '../../notifications/constants/notifications'
import { NotificationContent } from '../../notifications/interfaces/notification-properties.interface'
import { NotificationsManager } from '../../notifications/services/notifications-manager.service'
import { CreateOrUpdateShareDto } from '../../shares/dto/create-or-update-share.dto'
import type { ShareLink } from '../../shares/interfaces/share-link.interface'
import type { ShareProps } from '../../shares/interfaces/share-props.interface'
import type { ShareChild } from '../../shares/models/share-child.model'
import { SharesManager } from '../../shares/services/shares-manager.service'
import { MEMBER_TYPE } from '../../users/constants/member'
import { USER_ROLE } from '../../users/constants/user'
import { UserModel } from '../../users/models/user.model'
import type { User } from '../../users/schemas/user.interface'
import { users } from '../../users/schemas/users.schema'
import { UsersQueries } from '../../users/services/users-queries.service'
import { CACHE_QUOTA_SPACE_PREFIX, CACHE_QUOTA_TTL, CACHE_QUOTA_USER_PREFIX } from '../constants/cache'
import {
  SPACE_ALIAS,
  SPACE_ALL_OPERATIONS,
  SPACE_MAX_DISABLED_DAYS,
  SPACE_OPERATION,
  SPACE_PERSONAL,
  SPACE_REPOSITORY,
  SPACE_ROLE,
  SPACE_SHARES
} from '../constants/spaces'
import { CreateOrUpdateSpaceDto, SpaceMemberDto } from '../dto/create-or-update-space.dto'
import { DeleteSpaceDto } from '../dto/delete-space.dto'
import { SearchSpaceDto } from '../dto/search-space.dto'
import { SpaceTrash } from '../interfaces/space-trash.interface'
import { SpaceEnv } from '../models/space-env.model'
import { SpaceProps } from '../models/space-props.model'
import type { SpaceRootProps } from '../models/space-root-props.model'
import { SpaceModel } from '../models/space.model'
import type { SpaceRoot } from '../schemas/space-root.interface'
import type { Space } from '../schemas/space.interface'
import { spaces } from '../schemas/spaces.schema'
import { quotaKeyFromSpace } from '../utils/paths'
import { haveSpacePermission } from '../utils/permissions'
import { SpacesQueries } from './spaces-queries.service'

@Injectable()
export class SpacesManager {
  private readonly logger = new Logger(SpacesManager.name)

  constructor(
    private readonly contextManager: ContextManager,
    private readonly spacesQueries: SpacesQueries,
    private readonly usersQueries: UsersQueries,
    private readonly sharesManager: SharesManager,
    private readonly notificationsManager: NotificationsManager
  ) {}

  listSpaces(userId: number): Promise<Partial<SpaceProps>[]> {
    return this.spacesQueries.spaces(userId)
  }

  spacesWithDetails(userId: number): Promise<SpaceProps[]> {
    return this.spacesQueries.spacesWithDetails(userId)
  }

  uniqueRootName(name: string, names: string[]) {
    if (names.find((fName: string) => name.toLowerCase() === fName.toLowerCase())) {
      const nameExtension = path.extname(name)
      const nameWithoutExtension = path.basename(name, nameExtension)
      const originalName = nameWithoutExtension.replace(regExpNumberSuffix, '')
      let count = 1
      let newName = `${originalName}-${count}${nameExtension}`
      while (names.find((fName: string) => newName.toLowerCase() === fName.toLowerCase())) {
        count += 1
        newName = `${originalName}-${count}${nameExtension}`
      }
      return newName
    }
    return null
  }

  async spaceEnv(user: UserModel, urlSegments: string[], skipEndpointProtection = false): Promise<SpaceEnv> {
    /* SpaceEnv builder */
    let [repository, spaceAlias, rootAlias, ...paths] = urlSegments

    if (
      !repository ||
      (!spaceAlias && repository !== SPACE_REPOSITORY.SHARES) ||
      Object.values(SPACE_REPOSITORY).indexOf(repository as SPACE_REPOSITORY) === -1
    ) {
      throw new Error(`Space path is not valid : ${urlSegments}`)
    }

    let space: SpaceEnv
    if (spaceAlias === SPACE_ALIAS.PERSONAL) {
      /* Personal Space (static) */
      if (rootAlias) {
        // there is no root in a personal space
        paths.unshift(rootAlias)
        rootAlias = null
      }
      space = new SpaceEnv(SPACE_PERSONAL, rootAlias, false)
    } else if (repository === SPACE_REPOSITORY.SHARES) {
      if (spaceAlias) {
        /* Share */
        const spacePermissions: Partial<SpaceEnv> = await this.sharesManager.permissions(user, spaceAlias)
        if (spacePermissions) {
          space = new SpaceEnv(spacePermissions, null, false)
        }
      } else {
        /* Shares List (static) */
        space = new SpaceEnv(SPACE_SHARES, null, false)
      }
    } else {
      /* Space */
      if (repository === SPACE_REPOSITORY.TRASH && rootAlias) {
        // there is no root in a trash space
        paths.unshift(rootAlias)
        rootAlias = null
      }
      const spacePermissions: Partial<SpaceEnv> = await this.spacesQueries.permissions(user.id, spaceAlias, rootAlias)
      if (spacePermissions) {
        space = new SpaceEnv(spacePermissions, rootAlias || '')
      }
    }
    if (!space) return null
    try {
      space.setup(user, repository as SPACE_REPOSITORY, rootAlias, paths, urlSegments, skipEndpointProtection)
      await this.setQuotaExceeded(user, space)
      return space
    } catch (e) {
      this.logger.warn(`${this.spaceEnv.name} - *${space.alias}* : ${e}`)
      throw new HttpException(e.message, e instanceof FileError ? e.httpCode : HttpStatus.BAD_REQUEST)
    }
  }

  async searchSpaces(userId: number, searchSpaceDto: SearchSpaceDto): Promise<SpaceProps[]> {
    const sps: SpaceProps[] = []
    for (const s of await this.spacesQueries.spaces(userId, true)) {
      if (searchSpaceDto.shareInsidePermission && !haveSpacePermission(s, SPACE_OPERATION.SHARE_INSIDE)) {
        continue
      }
      if (!searchSpaceDto.search || `${s.name} ${s.alias} ${s.description || ''}`.toLowerCase().indexOf(searchSpaceDto.search) > -1) {
        sps.push(s)
      }
      if (sps.length >= searchSpaceDto.limit) {
        break
      }
    }
    return sps
  }

  async listSpacesWithPermissions(user: UserModel): Promise<SpaceEnv[]> {
    return Promise.all(
      (await this.spacesQueries.spaces(user.id, true)).map(async (s) => {
        const space = new SpaceEnv(s)
        await this.setQuotaExceeded(user, space)
        return space
      })
    )
  }

  async listTrashes(user: UserModel): Promise<SpaceTrash[]> {
    const trashes: SpaceTrash[] = []
    // todo: store 'Personal files' as const somewhere (used in frontend too)
    const personalTrash: SpaceTrash = { id: 0, name: 'Personal files', alias: SPACE_ALIAS.PERSONAL, nb: 0, mtime: 0, ctime: 0 }
    for (const space of [...(await this.listSpaces(user.id)), personalTrash] as SpaceTrash[]) {
      const rPath = space.alias === SPACE_ALIAS.PERSONAL ? user.trashPath : SpaceModel.getTrashPath(space.alias)
      try {
        space.nb = (await fs.readdir(rPath)).filter((f) => configuration.applications.files.showHiddenFiles || f[0] !== '.').length
        if (space.nb) {
          const stats = await fs.stat(rPath)
          space.mtime = stats.mtime.getTime()
          space.ctime = stats.birthtime.getTime()
          trashes.push(space)
        }
      } catch (e) {
        this.logger.error(`${this.listTrashes.name} - ${e}`)
      }
    }
    return trashes
  }

  async getSpace(user: UserModel, spaceId: number): Promise<SpaceProps> {
    const space: SpaceProps = await this.userCanAccessSpace(user.id, spaceId, true)
    if (space.roots?.length && !user.isAdmin) {
      // remove external path if the current user is not an administrator
      for (const root of space.roots) {
        root.externalPath = null
      }
    }
    return space
  }

  async createSpace(user: UserModel, createOrUpdateSpaceDto: CreateOrUpdateSpaceDto): Promise<SpaceProps> {
    /* only users with admin space role can create a space */
    // create space
    const space: SpaceProps = new SpaceProps({
      name: createOrUpdateSpaceDto.name,
      alias: await this.uniqueSpaceAlias(createOrUpdateSpaceDto.name, true),
      description: createOrUpdateSpaceDto.description,
      enabled: createOrUpdateSpaceDto.enabled,
      storageQuota: createOrUpdateSpaceDto.storageQuota,
      storageIndexing: createOrUpdateSpaceDto.storageIndexing,
      disabledAt: createOrUpdateSpaceDto.enabled ? null : new Date()
    })
    try {
      space.id = await this.spacesQueries.createSpace(space)
    } catch (e) {
      this.logger.error(`${this.createSpace.name} - unable to create space *${space.alias}* : ${e}`)
      throw new HttpException('Unable to create space', e)
    }
    // create space paths
    await SpaceModel.makePaths(space.alias)
    // add roots
    await this.updateRoots(user, space, space.roots, createOrUpdateSpaceDto.roots, [], [])
    // add members
    await this.updateMembers(user, space, createOrUpdateSpaceDto.members.concat(createOrUpdateSpaceDto.managers))
    // create links after members, user must be a space manager to create links
    await this.sharesManager.createOrUpdateLinksAsMembers(user, space, LINK_TYPE.SPACE, createOrUpdateSpaceDto.links)
    return this.spacesQueries.getSpaceAsManager(user.id, space.id)
  }

  async updateSpace(user: UserModel, spaceId: number, createOrUpdateSpaceDto: CreateOrUpdateSpaceDto): Promise<SpaceProps> {
    /* only managers of the space can update it */
    const space: SpaceProps = await this.userCanAccessSpace(user.id, spaceId, true)
    // check and update space info
    const spaceDiffProps: Partial<SpaceProps> = { modifiedAt: new Date() }
    const props: (keyof CreateOrUpdateSpaceDto)[] = ['name', 'description', 'enabled', 'storageQuota', 'storageIndexing']
    for (const prop of props) {
      if (createOrUpdateSpaceDto[prop] !== space[prop]) {
        spaceDiffProps[prop] = createOrUpdateSpaceDto[prop]
        if (prop === 'name') {
          spaceDiffProps.alias = await this.uniqueSpaceAlias(spaceDiffProps.name, true)
          if (space.alias !== spaceDiffProps.alias) {
            // must move the space to match the new alias
            const spaceLocationWasRenamed: boolean = await this.renameSpaceLocation(space.alias, spaceDiffProps.alias)
            if (!spaceLocationWasRenamed) {
              throw new HttpException('Unable to rename space', HttpStatus.INTERNAL_SERVER_ERROR)
            }
            space.alias = spaceDiffProps.alias
          }
        } else if (prop === 'enabled') {
          spaceDiffProps.disabledAt = spaceDiffProps[prop] ? null : new Date()
        }
      }
    }
    // updates in db
    this.spacesQueries.updateSpace(spaceId, spaceDiffProps).catch((e: Error) => this.logger.error(`${this.updateSpace.name} - ${e}`))
    // checks & updates members
    const linkMembers: SpaceMemberDto[] = await this.sharesManager.createOrUpdateLinksAsMembers(
      user,
      space,
      LINK_TYPE.SPACE,
      createOrUpdateSpaceDto.links
    )
    const rootOwnerIds: number[] = await this.updateMembers(user, space, [
      ...createOrUpdateSpaceDto.members,
      ...createOrUpdateSpaceDto.managers,
      ...linkMembers
    ])
    if (rootOwnerIds.length) {
      // removes the roots of removed members or those no longer having the `share inside` permission
      createOrUpdateSpaceDto.roots = createOrUpdateSpaceDto.roots.filter((r) => rootOwnerIds.indexOf(r.owner.id) === -1)
    }
    // checks & updates roots
    const aliases: string[] = space.roots.map((r) => r.alias)
    const names: string[] = [...(await dirListFileNames(SpaceModel.getFilesPath(space.alias))), ...space.roots.map((r) => r.name)]
    await this.updateRoots(user, space, space.roots, createOrUpdateSpaceDto.roots, aliases, names)
    if (rootOwnerIds.indexOf(user.id) > -1) {
      // current manager was removed
      return null
    } else {
      return this.spacesQueries.getSpaceAsManager(user.id, spaceId)
    }
  }

  async deleteSpace(user: UserModel, spaceId: number, deleteSpaceDto?: DeleteSpaceDto) {
    /* only managers of the space can disable it */
    const space: SpaceProps = await this.userCanAccessSpace(user.id, spaceId, true)
    // only admin can delete the space data, managers can only disable the space for 30 days
    const deleteNow: boolean = user.isAdmin && !!deleteSpaceDto?.deleteNow
    try {
      if (deleteNow) {
        await this.sharesManager.deleteAllLinkMembers(spaceId, LINK_TYPE.SPACE)
      }
      await this.deleteOrDisableSpace(space, deleteNow)
      this.logger.log(`${this.deleteSpace.name} - *${space.alias}* (${space.id}) was ${deleteNow ? 'deleted' : 'disabled'}`)
    } catch (e) {
      this.logger.error(`${this.deleteSpace.name} - *${space.alias}* (${space.id}) was not ${deleteNow ? 'deleted' : 'disabled'} : ${e}`)
      throw new HttpException('Unable to delete space', HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  async getUserRoots(user: UserModel, spaceId: number): Promise<SpaceRootProps[]> {
    /* if user has no permissions on the space an empty array will be returned  */
    return this.spacesQueries.getSpaceRoots(spaceId, user.id)
  }

  async updateUserRoots(user: UserModel, spaceId: number, userRoots: SpaceRootProps[], addOnly: boolean = false): Promise<SpaceRootProps[]> {
    const space: Partial<SpaceProps> = await this.userCanAccessSpace(user.id, spaceId)
    if (space.role !== SPACE_ROLE.IS_MANAGER && !haveSpacePermission(space, SPACE_OPERATION.SHARE_INSIDE)) {
      this.logger.warn(`is not allowed to share inside on this space : *${space.alias}* (${space.id})`)
      throw new HttpException('You are not allowed to do this action', HttpStatus.FORBIDDEN)
    }
    // current states
    const spaceRoots: SpaceRootProps[] = await this.spacesQueries.getSpaceRoots(spaceId)
    const aliases = spaceRoots.map((r) => r.alias)
    const names = [...(await dirListFileNames(SpaceModel.getFilesPath(space.alias))), ...spaceRoots.map((r) => r.name)]
    // force owner.id on new user roots (owner is optional and required for the next steps)
    userRoots.forEach((r: SpaceRootProps) => (r.owner = { id: user.id }))
    if (addOnly) {
      // short circuit the `updateRoots` function
      // we need to provide all space roots to avoid collisions on aliases and names for new user roots
      const toAdd: SpaceRootProps[] = await this.validateNewRoots(user, space, spaceRoots, userRoots, aliases, names)
      const status: Record<Exclude<ACTION, ACTION.DELETE_PERMANENTLY>, SpaceRootProps[]> = await this.spacesQueries.updateSpaceRoots(
        user.id,
        space.id,
        toAdd,
        [],
        []
      )
      Object.entries(status).forEach(([action, roots]: [ACTION, SpaceRootProps[]]) =>
        this.clearCachePermissionsAndOrNotify(space, action, user, null, roots).catch((e: Error) =>
          this.logger.error(`${this.updateUserRoots.name} - ${e}`)
        )
      )
      return this.getUserRoots(user, spaceId)
    } else {
      const currentUserRoots: SpaceRootProps[] = spaceRoots.filter((r) => r.owner?.id === user.id)
      await this.updateRoots(user, space, currentUserRoots, userRoots, aliases, names)
      return this.spacesQueries.getSpaceRoots(spaceId, user.id)
    }
  }

  async uniqueRootAlias(spaceId: number, alias: string, aliasesAndNames: string[], replaceCount = false): Promise<string> {
    /* for some webdav clients the root alias is displayed instead of the file name.
     * This is why a root alias must be unique for files too */
    if (aliasesAndNames.find((fName: string) => alias.toLowerCase() === fName.toLowerCase())) {
      const aliasExtension = path.extname(alias)
      const aliasWithoutExtension = path.basename(alias, aliasExtension)
      const originalAlias = createSlug(aliasWithoutExtension, replaceCount)
      let count = 1
      let newAlias = `${originalAlias}-${count}${aliasExtension}`
      while (await this.spacesQueries.spaceRootExistsForAlias(spaceId, newAlias)) {
        count += 1
        newAlias = `${originalAlias}-${count}${aliasExtension}`
      }
      return newAlias
    }
    return null
  }

  async updatePersonalSpacesQuota(forUser?: UserModel) {
    const props: (keyof User)[] = ['id', 'login', 'storageUsage', 'storageQuota']
    for (const user of await this.usersQueries.selectUsers(props, [
      lte(users.role, USER_ROLE.USER),
      ...(forUser ? [eq(users.id, forUser.id)] : [])
    ])) {
      const userPath = UserModel.getHomePath(user.login)
      if (!(await isPathExists(userPath))) {
        this.logger.warn(`${this.updatePersonalSpacesQuota.name} - *${user.login}* home path does not exist`)
        continue
      }
      const [size, errors] = await dirSize(userPath)
      for (const [path, error] of Object.entries(errors)) {
        this.logger.warn(`${this.updatePersonalSpacesQuota.name} - unable to get size for *${user.login}* on ${path} : ${error}`)
      }
      const spaceQuota: StorageQuota = { storageUsage: size, storageQuota: user.storageQuota }
      this.spacesQueries.cache
        .set(`${CACHE_QUOTA_USER_PREFIX}-${user.id}`, spaceQuota, CACHE_QUOTA_TTL)
        .catch((e: Error) => this.logger.error(`${this.updatePersonalSpacesQuota.name} - ${e}`))
      if (user.storageUsage !== spaceQuota.storageUsage) {
        this.logger.log(
          `${this.updatePersonalSpacesQuota.name} - user *${user.login}* (${user.id}) : storage usage updated : ${spaceQuota.storageUsage}`
        )
        await this.usersQueries.updateUserOrGuest(user.id, { storageUsage: spaceQuota.storageUsage })
      }
    }
  }

  async updateSpacesQuota(spaceId?: number) {
    for (const space of await this.spacesQueries.spacesQuotaPaths(spaceId)) {
      const spacePath = SpaceModel.getHomePath(space.alias)
      if (!(await isPathExists(spacePath))) {
        this.logger.warn(`${this.updateSpacesQuota.name} - *${space.alias}* home path does not exist`)
        continue
      }
      let size = 0
      for (const rPath of [spacePath, ...space.externalPaths.filter(Boolean)]) {
        const [rPathSize, errors] = await dirSize(rPath)
        size += rPathSize
        for (const [path, error] of Object.entries(errors)) {
          this.logger.warn(`${this.updateSpacesQuota.name} - unable to get size for *${space.alias}* on ${path} : ${error}`)
        }
      }
      const spaceQuota: StorageQuota = { storageUsage: size, storageQuota: space.storageQuota }
      this.spacesQueries.cache
        .set(`${CACHE_QUOTA_SPACE_PREFIX}-${space.id}`, spaceQuota, CACHE_QUOTA_TTL)
        .catch((e: Error) => this.logger.error(`${this.updateSpacesQuota.name} - ${e}`))
      if (space.storageUsage !== spaceQuota.storageUsage) {
        this.logger.log(`${this.updateSpacesQuota.name} - space *${space.alias}* (${space.id}) : storage usage updated : ${spaceQuota.storageUsage}`)
        await this.spacesQueries.updateSpace(space.id, { storageUsage: spaceQuota.storageUsage })
      }
    }
  }

  async deleteExpiredSpaces() {
    /* Removes spaces that have been disabled for more than 30 days */
    const props: (keyof Space)[] = ['id', 'name', 'alias', 'disabledAt']
    for (const space of await this.spacesQueries.selectSpaces(props, [eq(spaces.enabled, false), isNotNull(spaces.disabledAt)])) {
      const disabled = new Date(space.disabledAt)
      disabled.setDate(disabled.getDate() + SPACE_MAX_DISABLED_DAYS)
      if (new Date() > disabled) {
        try {
          await this.sharesManager.deleteAllLinkMembers(space.id, LINK_TYPE.SPACE)
          await this.deleteOrDisableSpace(space, true)
          this.logger.log(`${this.deleteExpiredSpaces.name} - space *${space.alias}* (${space.id}) was deleted`)
        } catch (e) {
          this.logger.error(`${this.deleteExpiredSpaces.name} - space *${space.alias}* (${space.id}) was not deleted : ${e}`)
        }
      }
    }
  }

  async listSpaceShares(user: UserModel, spaceId: number): Promise<ShareChild[]> {
    if (await this.userIsSpaceManager(user, spaceId)) {
      return this.sharesManager.listSpaceShares(spaceId)
    }
  }

  async getSpaceShare(user: UserModel, spaceId: number, shareId: number): Promise<ShareProps> {
    if (await this.userIsSpaceManager(user, spaceId, shareId)) {
      return this.sharesManager.getShareWithMembers(user, shareId, true)
    }
  }

  async updateSpaceShare(user: UserModel, spaceId: number, shareId: number, createOrUpdateShareDto: CreateOrUpdateShareDto): Promise<ShareProps> {
    if (await this.userIsSpaceManager(user, spaceId, shareId)) {
      return this.sharesManager.updateShare(user, shareId, createOrUpdateShareDto, true)
    }
  }

  async deleteSpaceShare(user: UserModel, spaceId: number, shareId: number): Promise<void> {
    if (await this.userIsSpaceManager(user, spaceId, shareId)) {
      return this.sharesManager.deleteShare(user, shareId, true)
    }
  }

  async getSpaceShareLink(user: UserModel, spaceId: number, shareId: number): Promise<ShareLink> {
    if (await this.userIsSpaceManager(user, spaceId, shareId)) {
      return this.sharesManager.getShareLink(user, shareId, true)
    }
  }

  private async updateMembers(user: UserModel, space: SpaceProps, currentMembers: SpaceMemberDto[]): Promise<number[]> {
    if (space.members.length === 0 && currentMembers.length === 0) {
      return
    }
    // diff
    const [add, update, remove]: [SpaceMemberDto[], Record<string | 'object', { old: any; new: any } | SpaceMemberDto>[], SpaceMemberDto[]] =
      diffCollection(space.members, currentMembers, ['permissions', 'spaceRole'], ['id', 'type'])

    // check members whitelists
    let toAdd: SpaceMemberDto[] = []
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
            `${this.updateMembers.name} - cannot add ${m.type} (${m.id}) to space *${space.alias}* (${space.id}) : not in the members whitelist`
          )
          return false
        }
        return true
      })
    }

    // filter links
    const toRemove: SpaceMemberDto[] = remove.filter((m) => !m.linkId)
    // do remove links
    this.sharesManager.deleteLinkMembers(remove.filter((m) => !!m.linkId)).catch((e: Error) => this.logger.error(`${this.updateMembers.name} - ${e}`))
    // do update members
    const status: Record<
      Exclude<ACTION, ACTION.DELETE_PERMANENTLY>,
      {
        groupIds: number[]
        userIds: number[]
      }
    > = await this.spacesQueries.updateMembers(space.id, toAdd, convertDiffUpdate(update), toRemove)

    // lists deleted and updated members as potential share or space roots owners
    const [rmShareOwners, upShareOwners, rmRootOwners]: [
      SpaceMemberDto[],
      {
        object: SpaceMemberDto
        rmPermissions: SPACE_OPERATION[]
      }[],
      number[]
    ] = [[], [], []]

    for (const [action, members] of Object.entries(status) as Entries<typeof status>) {
      if (!members.userIds.length && !members.groupIds.length) continue
      if (action === ACTION.DELETE) {
        // stores the removed members who might own shares created from the current space
        rmShareOwners.push(
          ...toRemove.filter(
            (m) =>
              ((m.type === MEMBER_TYPE.USER || m.type === MEMBER_TYPE.GUEST) && members.userIds.indexOf(m.id) > -1) ||
              ((m.type === MEMBER_TYPE.GROUP || m.type === MEMBER_TYPE.PGROUP) && members.groupIds.indexOf(m.id) > -1)
          )
        )
        // stores ids of removed members that might have space roots
        rmRootOwners.push(...members.userIds)
      } else if (action === ACTION.UPDATE) {
        // stores permissions updates and members who might own shares created from the current space
        // ignore space managers (they have all permissions)
        for (const m of update as {
          object: SpaceMemberDto
          permissions?: { old: string; new: string }
          spaceRole?: { old: number; new: number }
        }[]) {
          if (
            ((m.object.type === MEMBER_TYPE.USER || m.object.type === MEMBER_TYPE.GUEST) &&
              m.object.spaceRole !== SPACE_ROLE.IS_MANAGER &&
              members.userIds.indexOf(m.object.id) > -1) ||
            ((m.object.type === MEMBER_TYPE.GROUP || m.object.type === MEMBER_TYPE.PGROUP) && members.groupIds.indexOf(m.object.id) > -1)
          ) {
            // special case, the manager was moved to members without permissions change
            if (!m.permissions && m.spaceRole.new === SPACE_ROLE.IS_MEMBER) {
              m.permissions = { old: SPACE_ALL_OPERATIONS, new: m.object.permissions }
            }
            // `share inside` permission is only used for spaces
            const diffPermissions = differencePermissions(m.permissions.old, m.permissions.new).filter((p) => p !== SPACE_OPERATION.SHARE_INSIDE)
            if (diffPermissions.length) {
              upShareOwners.push({ object: m.object, rmPermissions: diffPermissions as SPACE_OPERATION[] })
            }
          }
        }
      }
      // clear cache &|| notify
      this.onSpaceActionForMembers(space, action, members, user).catch((e: Error) => this.logger.error(`${this.updateMembers.name} - ${e}`))
    }
    // do updates
    // remove or update potential shares
    this.sharesManager
      .updateSharesFromSpace(space.id, currentMembers, rmShareOwners, upShareOwners)
      .catch((e: Error) => this.logger.error(`${this.updateMembers.name} - ${e}`))
    // return potential root owner ids
    return rmRootOwners
  }

  private async updateRoots(
    user: UserModel,
    space: Partial<SpaceProps>,
    curRoots: SpaceRootProps[],
    newRoots: SpaceRootProps[],
    aliases: string[],
    names: string[]
  ) {
    // diff
    const [add, toUpdate, toRemove]: [
      SpaceRootProps[],
      Record<
        string | 'object',
        | {
            old: any
            new: any
          }
        | SpaceRootProps
        | any
      >[],
      SpaceRootProps[]
    ] = diffCollection(curRoots, newRoots, ['name', 'alias', 'permissions'])

    // update
    for (const props of toUpdate) {
      if ('alias' in props) {
        props.alias.new = (await this.uniqueRootAlias(space.id, props.alias.new, aliases.concat(names), true)) || props.alias.new
        // remove from space cache permissions
        this.spacesQueries
          .clearCachePermissions(space.alias, [props.alias.old, props.alias.new])
          .catch((e: Error) => this.logger.error(`${this.updateRoots.name} - ${e}`))
        // update aliases list for next roots
        aliases.push(props.alias.new)
      }
      if ('name' in props) {
        props.name.new = this.uniqueRootName(props.name.new, names) || props.name.new
        // update names list for next roots
        names.push(props.name.new)
      }
    }

    // format actions
    const toAdd = await this.validateNewRoots(user, space, curRoots, add, aliases, names)

    // remove a root implies that all shares with a reference to root.id will be deleted in cascade
    // however, it is "cleaner" to warn users about the deletion of these shares and to clear the permission caches before the cascade deletion
    // it must be assumed that the deletion and modifications of space roots will be successful
    const [rmRoots, rmRootPermissions]: [
      SpaceRoot['id'][],
      {
        id: SpaceRoot['id']
        rmPermissions: SPACE_OPERATION[]
      }[]
    ] = [
      toRemove.map((r) => r.id),
      (toUpdate as any).reduce((acc: typeof rmRootPermissions, r: any): typeof rmRootPermissions => {
        if (r.permissions !== undefined) {
          const diffPermissions = differencePermissions(r.permissions.old, r.permissions.new) as SPACE_OPERATION[]
          if (diffPermissions.length) {
            acc.push({ id: r.object.id, rmPermissions: diffPermissions })
          }
        }
        return acc
      }, [])
    ]
    // do share updates
    await this.sharesManager.updateSharesFromSpaceRoots(space.id, rmRoots, rmRootPermissions)

    // do root updates
    const status: Record<Exclude<ACTION, ACTION.DELETE_PERMANENTLY>, SpaceRootProps[]> = await this.spacesQueries.updateSpaceRoots(
      user.id,
      space.id,
      toAdd,
      convertDiffUpdate(toUpdate),
      toRemove
    )
    Object.entries(status).forEach(([action, roots]: [ACTION, SpaceRootProps[]]) =>
      this.clearCachePermissionsAndOrNotify(space, action, user, null, roots).catch((e: Error) =>
        this.logger.error(`${this.updateRoots.name} - ${e}`)
      )
    )
  }

  private async validateNewRoots(
    user: UserModel,
    space: Partial<SpaceProps>,
    curRoots: SpaceRootProps[],
    newRoots: SpaceRootProps[],
    aliases: string[],
    names: string[]
  ): Promise<SpaceRootProps[]> {
    const toAdd: SpaceRootProps[] = []
    for (const r of newRoots) {
      if (r.externalPath && !user.isAdmin) {
        this.logger.warn(`ignore new root *${r.alias}* (${r.externalPath}) : adding an external path requires the admin role`)
        continue
      }
      const rPath = r.externalPath || path.join(user.filesPath, r.file.path)
      if (!(await isPathExists(rPath))) {
        this.logger.warn(`ignore new root *${r.alias}* (${r.file.path}) : *${rPath}* does not exist`)
        continue
      }
      // check if a parent exists for an externalPath or if the file (or parent) is already anchored
      let rExists: SpaceRootProps
      if (r.externalPath) {
        rExists = curRoots.find((cr) => cr.externalPath && r.externalPath.startsWith(cr.externalPath))
      } else {
        rExists = curRoots.find(
          (cr) => cr.file?.id === r.file.id || (cr.owner?.id === r.owner.id && cr.file?.path && r.file.path.startsWith(cr.file.path))
        )
      }
      if (rExists) {
        this.logger.warn(`ignore new root *${r.alias}* (${r.externalPath || r.file.path}) (${r.file?.id}) : parent or file already exists in roots`)
        continue
      }
      // keep the file id (maybe already in db)
      if (!r.externalPath) {
        r.file = { ...(await getProps(rPath, r.file.path)), id: r.file.id }
      }
      r.alias = (await this.uniqueRootAlias(space.id, r.alias, aliases.concat(names), true)) || r.alias
      // update aliases list for next roots
      aliases.push(r.alias)
      r.name = this.uniqueRootName(r.name, names) || r.name
      // update names list for next roots
      names.push(r.name)
      // reset id
      r.id = 0
      toAdd.push(r)
    }
    return toAdd
  }

  private async deleteOrDisableSpace(space: Partial<SpaceProps>, deleteNow: boolean = false) {
    if (deleteNow) {
      // clear cache &|| notify
      const memberIds: { groupIds: number[]; userIds: number[] } = await this.spacesQueries.getSpaceMemberIds(space.id)
      this.onSpaceActionForMembers(space, ACTION.DELETE_PERMANENTLY, memberIds).catch((e: Error) =>
        this.logger.error(`${this.deleteOrDisableSpace.name} - ${e}`)
      )
      // remove all shares related to the space
      await this.sharesManager.removeSharesFromSpace(space.id)
    }
    await this.spacesQueries.deleteSpace(space.id, deleteNow)
    if (deleteNow) {
      this.spacesQueries.cache
        .del(`${CACHE_QUOTA_SPACE_PREFIX}-${space.id}`)
        .catch((e: Error) => this.logger.error(`${this.deleteOrDisableSpace.name} - ${e}`))
      await this.deleteSpaceLocation(space.alias)
    }
  }

  private async deleteSpaceLocation(spaceAlias: string) {
    const spaceLocation = SpaceModel.getHomePath(spaceAlias)
    if (await isPathExists(spaceLocation)) {
      await removeFiles(spaceLocation)
      this.logger.warn(`${this.deleteSpaceLocation.name} - space *${spaceAlias}* location was deleted`)
    } else {
      this.logger.warn(`${this.deleteSpaceLocation.name} - space *${spaceAlias}* location does not exist : ${spaceLocation}`)
    }
  }

  private async renameSpaceLocation(oldSpaceAlias: string, newSpaceAlias: string): Promise<boolean> {
    const currentSpaceLocation: string = SpaceModel.getHomePath(oldSpaceAlias)
    if (await isPathExists(currentSpaceLocation)) {
      const newSpaceLocation: string = SpaceModel.getHomePath(newSpaceAlias)
      if (await isPathExists(newSpaceLocation)) {
        this.logger.warn(`${this.renameSpaceLocation.name} - *${newSpaceAlias}* home path already exists : ${newSpaceLocation}`)
        return false
      } else {
        try {
          await moveFiles(currentSpaceLocation, newSpaceLocation)
          return true
        } catch (e) {
          // try to restore
          await moveFiles(newSpaceLocation, currentSpaceLocation, true)
          this.logger.error(
            `${this.renameSpaceLocation.name} - unable to rename space location from *${currentSpaceLocation}* to *${newSpaceLocation}* : ${e}`
          )
          return false
        }
      }
    } else {
      this.logger.warn(`${this.renameSpaceLocation.name} - *${oldSpaceAlias}* space location does not exist : ${currentSpaceLocation}`)
      return false
    }
  }

  private async uniqueSpaceAlias(name: string, replaceCount = false): Promise<string> {
    let alias = createSlug(name, replaceCount)
    let count = 0
    // Personal space name is reserved
    if (alias === SPACE_ALIAS.PERSONAL) {
      count += 1
      alias = `${name}-${count}`
    }
    while (await this.spacesQueries.spaceExistsForAlias(alias)) {
      count += 1
      alias = `${name}-${count}`
    }
    return alias
  }

  private async userCanAccessSpace(userId: number, spaceId: number, asManager: true): Promise<SpaceProps>
  private async userCanAccessSpace(userId: number, spaceId: number, asManager?: false): Promise<Partial<SpaceProps>>
  private async userCanAccessSpace(userId: number, spaceId: number, asManager: boolean = false): Promise<Partial<SpaceProps>> {
    if (asManager) {
      // Get all space details if user is a manager
      const space: SpaceProps = await this.spacesQueries.getSpaceAsManager(userId, spaceId)
      if (!space) {
        this.logger.warn(`space (${spaceId}) not found or not authorized for user (${userId})`)
        throw new HttpException('Not authorized', HttpStatus.FORBIDDEN)
      }
      return space
    } else {
      const [space]: SpaceProps[] = await this.spacesQueries.spaces(userId, true, spaceId)
      if (!space) {
        this.logger.warn(`space (${spaceId}) not found or not authorized for user (${userId})`)
        throw new HttpException('Space not found', HttpStatus.NOT_FOUND)
      }
      return space
    }
  }

  private async userIsSpaceManager(user: UserModel, spaceId: number, shareId?: number): Promise<boolean> {
    if (!(await this.spacesQueries.userIsSpaceManager(user.id, spaceId, shareId))) {
      this.logger.warn(`space (${spaceId}) not found or not authorized for user (${user.id})`)
      throw new HttpException('Not authorized', HttpStatus.FORBIDDEN)
    }
    return true
  }

  private async setQuotaExceeded(user: UserModel, space: SpaceEnv) {
    /* extract quota from spaces|shares|roots */
    if (space.inSharesList) {
      return
    }
    const cacheQuotaKey = quotaKeyFromSpace(user.id, space)
    if (!cacheQuotaKey) {
      this.logger.verbose(`${this.setQuotaExceeded.name} - quota was ignored for space : *${space.alias}* (${space.id})`)
      return
    }
    let quota: StorageQuota = await this.spacesQueries.cache.get(cacheQuotaKey)
    if (!quota) {
      // the quota scheduler has not started yet or the cache has been cleared
      if (space.inPersonalSpace) {
        await this.updatePersonalSpacesQuota(user)
      } else if (space.inSharesRepository) {
        // Shares with external paths
        await this.sharesManager.updateSharesExternalPathQuota(space.id)
      } else {
        await this.updateSpacesQuota(space.id)
      }
      quota = await this.spacesQueries.cache.get(cacheQuotaKey)
    }
    if (quota) {
      space.storageUsage = quota.storageUsage
      space.storageQuota = quota.storageQuota
      space.quotaIsExceeded = quota.storageQuota !== null && quota.storageUsage >= quota.storageQuota
    } else {
      this.logger.verbose(`${this.setQuotaExceeded.name} - quota not found for space : *${space.alias}* (${space.id})`)
    }
  }

  private async onSpaceActionForMembers(
    space: Partial<SpaceProps>,
    action: ACTION,
    members: {
      groupIds: number[]
      userIds: number[]
    },
    user?: UserModel
  ) {
    this.clearCachePermissionsAndOrNotify(
      space,
      action,
      user,
      Array.from(new Set([...(await this.usersQueries.allUserIdsFromGroupsAndSubGroups(members.groupIds)), ...members.userIds])).filter(
        (uid) => uid !== user?.id
      )
    ).catch((e: Error) => this.logger.error(`${this.onSpaceActionForMembers.name} - ${e}`))
  }

  private async clearCachePermissionsAndOrNotify(
    space: Partial<SpaceProps>,
    action: ACTION,
    user?: UserModel,
    memberIds?: number[],
    roots?: SpaceRootProps[]
  ): Promise<void> {
    if (memberIds?.length) {
      // clear permissions for space members
      if (action === ACTION.DELETE_PERMANENTLY) {
        this.logger.verbose(`${this.clearCachePermissionsAndOrNotify.name} - space:${space.alias} ${action}`)
        this.spacesQueries
          .clearCachePermissions(space.alias)
          .catch((e: Error) => this.logger.error(`${this.clearCachePermissionsAndOrNotify.name} - ${e}`))
      } else {
        // update space members cache
        this.logger.verbose(`${this.clearCachePermissionsAndOrNotify.name} - space:${space.alias} ${action} members:${JSON.stringify(memberIds)}`)
        this.spacesQueries
          .clearCachePermissions(space.alias, undefined, memberIds)
          .catch((e: Error) => this.logger.error(`${this.clearCachePermissionsAndOrNotify.name} - ${e}`))
      }
      // notify
      if (action !== ACTION.UPDATE) {
        // notify the members who have joined or left the space
        const notification: NotificationContent = {
          app: NOTIFICATION_APP.SPACES,
          event: NOTIFICATION_APP_EVENT.SPACES[action],
          element: space.name,
          url: ''
        }
        this.notificationsManager
          .create(memberIds, notification, {
            currentUrl: this.contextManager.headerOriginUrl(),
            action: action
          })
          .catch((e: Error) => this.logger.error(`${this.clearCachePermissionsAndOrNotify.name} - ${e}`))
      }
    } else if (roots?.length) {
      // clear permissions for space roots
      const rootAliases: string[] = roots.map((r) => r.alias)
      this.logger.verbose(`${this.clearCachePermissionsAndOrNotify.name} - space:${space.alias} ${action} roots:${JSON.stringify(rootAliases)}`)
      if (action !== ACTION.ADD) {
        this.spacesQueries
          .clearCachePermissions(space.alias, rootAliases)
          .catch((e: Error) => this.logger.error(`${this.clearCachePermissionsAndOrNotify.name} - ${e}`))
      }
      // notify
      if (action !== ACTION.UPDATE) {
        // notify the space members that a new root was anchored / unanchored
        const spaceMembers = await this.spacesQueries.getSpaceMemberIds(space.id)
        const spaceUserIds = Array.from(
          new Set([...(await this.usersQueries.allUserIdsFromGroupsAndSubGroups(spaceMembers.groupIds)), ...spaceMembers.userIds])
        ).filter((uid) => uid !== user?.id)
        if (!spaceUserIds.length) {
          return
        }
        for (const r of roots) {
          const notification: NotificationContent = {
            app: NOTIFICATION_APP.SPACE_ROOTS,
            event: NOTIFICATION_APP_EVENT.SPACE_ROOTS[action],
            element: r.name,
            url: `${SPACE_REPOSITORY.FILES}/${space.name}`
          }
          this.notificationsManager
            .create(spaceUserIds, notification, {
              currentUrl: this.contextManager.headerOriginUrl(),
              author: user,
              action: action
            })
            .catch((e: Error) => this.logger.error(`${this.clearCachePermissionsAndOrNotify.name} - ${e}`))
        }
      }
    }
  }
}
