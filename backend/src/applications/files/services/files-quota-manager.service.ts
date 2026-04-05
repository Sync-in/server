import { Injectable, Logger } from '@nestjs/common'
import { SpacesQueries } from '../../spaces/services/spaces-queries.service'
import { UsersQueries } from '../../users/services/users-queries.service'
import type { StorageQuota } from '../../../common/interfaces'
import type { User } from '../../users/schemas/user.interface'
import { eq, lte } from 'drizzle-orm'
import { users } from '../../users/schemas/users.schema'
import { USER_ROLE } from '../../users/constants/user'
import { UserModel } from '../../users/models/user.model'
import { dirSize, isPathExists } from '../utils/files'
import { SpaceModel } from '../../spaces/models/space.model'
import { SharesQueries } from '../../shares/services/shares-queries.service'
import { SpaceEnv } from '../../spaces/models/space-env.model'
import { CACHE_QUOTA_EVENT_UPDATE_PREFIX, CACHE_QUOTA_TTL } from '../constants/cache'
import { genQuotaCacheKey, quotaCacheKeyFromSpace } from '../utils/quota'
import { FILE_REPOSITORY } from '../constants/operations'

@Injectable()
export class FilesQuotaManager {
  private readonly logger = new Logger(FilesQuotaManager.name)

  constructor(
    private readonly spacesQueries: SpacesQueries,
    private readonly usersQueries: UsersQueries,
    private readonly sharesQueries: SharesQueries
  ) {}

  async setQuotaExceeded(user: UserModel, space: SpaceEnv) {
    /* extract quota from spaces|shares|roots */
    if (space.inSharesList) {
      return
    }
    const cacheQuotaKey = quotaCacheKeyFromSpace(user.id, space)
    if (!cacheQuotaKey) {
      this.logger.warn({ tag: this.setQuotaExceeded.name, msg: `quota was ignored for space : *${space.alias}* (${space.id})` })
      return
    }
    let quota: StorageQuota = await this.spacesQueries.cache.get(cacheQuotaKey)
    if (!quota) {
      // the quota scheduler has not started yet or the cache has been cleared
      if (space.inPersonalSpace) {
        quota = await this.updatePersonalSpacesQuota(user.id)
      } else if (space.inSharesRepository) {
        // Shares with external paths
        quota = await this.updateSharesExternalPathQuota(space.id)
      } else {
        quota = await this.updateSpacesQuota(space.id)
      }
    }
    if (quota) {
      space.storageUsage = quota.storageUsage
      space.storageQuota = quota.storageQuota
      space.quotaIsExceeded = quota.storageQuota !== null && quota.storageUsage >= quota.storageQuota
    } else {
      this.logger.verbose({ tag: this.setQuotaExceeded.name, msg: `quota not found for space : *${space.alias}* (${space.id})` })
    }
  }

  async updateStorageUsageEntries() {
    for (const k of await this.spacesQueries.cache.keys(`${CACHE_QUOTA_EVENT_UPDATE_PREFIX}-*`)) {
      try {
        const keySegments = k.split('-')
        const [repository, idPart] = keySegments.slice(-2)
        const id = Number.parseInt(idPart ?? '', 10)
        if (repository === FILE_REPOSITORY.USER) {
          await this.updatePersonalSpacesQuota(id)
        } else if (repository === FILE_REPOSITORY.SPACE) {
          await this.updateSpacesQuota(id)
        } else if (repository === FILE_REPOSITORY.SHARE) {
          await this.updateSharesExternalPathQuota(id)
        } else {
          this.logger.warn({ tag: this.updateStorageUsageEntries.name, msg: `Unknown type: ${repository}` })
        }
      } catch (e) {
        this.logger.error({ tag: this.updateStorageUsageEntries.name, msg: `${e}` })
      } finally {
        this.spacesQueries.cache
          .del(k)
          .catch((e) => this.logger.warn({ tag: this.updateStorageUsageEntries.name, msg: `Unable to clean key: ${k} - ${e}` }))
      }
    }
  }

  async updateStorageQuota(id: number, type: FILE_REPOSITORY, quota: number) {
    const cacheKey = genQuotaCacheKey(id, type)
    const entryQuota: StorageQuota = await this.spacesQueries.cache.get(cacheKey)
    if (entryQuota && entryQuota.storageUsage !== undefined) {
      this.spacesQueries.cache
        .set(cacheKey, { storageUsage: entryQuota.storageUsage, storageQuota: quota }, CACHE_QUOTA_TTL)
        .catch((e: Error) => this.logger.error({ tag: this.updateStorageQuota.name, msg: `type *${type}* (${id}) - ${e}` }))
    } else {
      // store event update for later propagation
      const updateCacheKey = genQuotaCacheKey(id, type, true)
      this.spacesQueries.cache
        .set(updateCacheKey, true, CACHE_QUOTA_TTL)
        .catch((e: Error) => this.logger.error({ tag: this.updateStorageQuota.name, msg: `type *${type}* (${id}) event - ${e}` }))
    }
  }

  async updatePersonalSpacesQuota(): Promise<void>
  async updatePersonalSpacesQuota(userId: number): Promise<StorageQuota>
  async updatePersonalSpacesQuota(userId?: number): Promise<void | StorageQuota> {
    const props: (keyof User)[] = ['id', 'login', 'storageUsage', 'storageQuota']
    for (const user of await this.usersQueries.selectUsers(props, [lte(users.role, USER_ROLE.USER), ...(userId ? [eq(users.id, userId)] : [])])) {
      const userPath = UserModel.getHomePath(user.login)
      if (!(await isPathExists(userPath))) {
        this.logger.warn({ tag: this.updatePersonalSpacesQuota.name, msg: `*${user.login}* home path does not exist` })
        continue
      }
      const [size, errors] = await dirSize(userPath)
      for (const [path, error] of Object.entries(errors)) {
        this.logger.warn({ tag: this.updatePersonalSpacesQuota.name, msg: `unable to get size for *${user.login}* on ${path} : ${error}` })
      }
      const spaceQuota: StorageQuota = { storageUsage: size, storageQuota: user.storageQuota }
      this.spacesQueries.cache
        .set(genQuotaCacheKey(user.id, FILE_REPOSITORY.USER), spaceQuota, CACHE_QUOTA_TTL)
        .catch((e: Error) => this.logger.error({ tag: this.updatePersonalSpacesQuota.name, msg: `user *${user.login}* (${user.id}) : ${e}` }))
      if (user.storageUsage !== spaceQuota.storageUsage) {
        this.usersQueries.updateUserOrGuest(user.id, { storageUsage: spaceQuota.storageUsage }).then(
          (updated: boolean) =>
            updated &&
            this.logger.log({
              tag: this.updatePersonalSpacesQuota.name,
              msg: `user *${user.login}* (${user.id}) - storage usage updated: ${spaceQuota.storageUsage}`
            })
        )
      }
      if (userId) {
        return spaceQuota
      }
    }
  }

  async updateSpacesQuota(): Promise<void>
  async updateSpacesQuota(spaceId: number): Promise<StorageQuota>
  async updateSpacesQuota(spaceId?: number): Promise<void | StorageQuota> {
    for (const space of await this.spacesQueries.spacesQuotaPaths(spaceId)) {
      const spacePath = SpaceModel.getHomePath(space.alias)
      if (!(await isPathExists(spacePath))) {
        this.logger.warn({ tag: this.updateSpacesQuota.name, msg: `*${space.alias}* home path does not exist` })
        continue
      }
      let size = 0
      for (const rPath of [spacePath, ...space.externalPaths.filter(Boolean)]) {
        const [rPathSize, errors] = await dirSize(rPath)
        size += rPathSize
        for (const [path, error] of Object.entries(errors)) {
          this.logger.warn({ tag: this.updateSpacesQuota.name, msg: `unable to get size for *${space.alias}* on ${path} : ${error}` })
        }
      }
      const spaceQuota: StorageQuota = { storageUsage: size, storageQuota: space.storageQuota }
      this.spacesQueries.cache
        .set(genQuotaCacheKey(space.id, FILE_REPOSITORY.SPACE), spaceQuota, CACHE_QUOTA_TTL)
        .catch((e: Error) => this.logger.error({ tag: this.updateSpacesQuota.name, msg: `space *${space.alias}* (${space.id}) : ${e}` }))
      if (space.storageUsage !== spaceQuota.storageUsage) {
        this.spacesQueries.updateSpace(space.id, { storageUsage: spaceQuota.storageUsage }).then(
          (updated: boolean) =>
            updated &&
            this.logger.log({
              tag: this.updateSpacesQuota.name,
              msg: `space *${space.alias}* (${space.id}) - storage usage updated : ${spaceQuota.storageUsage}`
            })
        )
      }
      if (spaceId) {
        return spaceQuota
      }
    }
  }

  async updateSharesExternalPathQuota(): Promise<void>
  async updateSharesExternalPathQuota(shareId: number): Promise<StorageQuota>
  async updateSharesExternalPathQuota(shareId?: number): Promise<void | StorageQuota> {
    for (const share of await this.sharesQueries.sharesQuotaExternalPaths(shareId)) {
      if (!(await isPathExists(share.externalPath))) {
        this.logger.warn({ tag: this.updateSharesExternalPathQuota.name, msg: `*${share.alias}* home path does not exist` })
        continue
      }
      const [size, errors] = await dirSize(share.externalPath)
      for (const [path, error] of Object.entries(errors)) {
        this.logger.warn({ tag: this.updateSharesExternalPathQuota.name, msg: `unable to get size for *${share.alias}* on ${path} : ${error}` })
      }
      const shareQuota: StorageQuota = { storageUsage: size, storageQuota: share.storageQuota }
      this.sharesQueries.cache
        .set(genQuotaCacheKey(share.id, FILE_REPOSITORY.SHARE), shareQuota, CACHE_QUOTA_TTL)
        .catch((e: Error) => this.logger.error({ tag: this.updateSharesExternalPathQuota.name, msg: `share *${share.alias}* (${share.id}) : ${e}` }))
      if (share.storageUsage !== shareQuota.storageUsage) {
        this.sharesQueries.updateShare(share.id, { storageUsage: shareQuota.storageUsage }).then(
          (updated: boolean) =>
            updated &&
            this.logger.log({
              tag: this.updateSharesExternalPathQuota.name,
              msg: `share *${share.alias}* (${share.id}) - storage usage updated : ${shareQuota.storageUsage}`
            })
        )
      }
      if (shareId) {
        return shareQuota
      }
    }
  }
}
