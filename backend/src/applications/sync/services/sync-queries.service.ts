import { Inject, Injectable } from '@nestjs/common'
import { and, desc, eq, SQL, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/mysql-core'
import crypto from 'node:crypto'
import { convertHumanTimeToSeconds } from '../../../common/functions'
import { currentTimeStamp } from '../../../common/shared'
import { CacheDecorator } from '../../../infrastructure/cache/cache.decorator'
import { Cache } from '../../../infrastructure/cache/services/cache.service'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants'
import type { DBSchema } from '../../../infrastructure/database/interfaces/database.interface'
import { concatDistinctObjectsInArray, dbCheckAffectedRows, dbGetInsertedId } from '../../../infrastructure/database/utils'
import { filePathSQL, files } from '../../files/schemas/files.schema'
import { shares } from '../../shares/schemas/shares.schema'
import { spacesRoots } from '../../spaces/schemas/spaces-roots.schema'
import { spaces } from '../../spaces/schemas/spaces.schema'
import type { UserModel } from '../../users/models/user.model'
import { CLIENT_TOKEN_EXPIRATION_TIME } from '../constants/auth'
import { SYNC_REPOSITORY } from '../constants/sync'
import { SyncClientPaths } from '../interfaces/sync-client-paths.interface'
import { SyncClientInfo } from '../interfaces/sync-client.interface'
import { SyncDBProps, SyncPathSettings } from '../interfaces/sync-path.interface'
import { SyncClient } from '../schemas/sync-client.interface'
import { syncClients } from '../schemas/sync-clients.schema'
import { SyncPath } from '../schemas/sync-path.interface'
import { syncPaths } from '../schemas/sync-paths.schema'

@Injectable()
export class SyncQueries {
  constructor(
    @Inject(DB_TOKEN_PROVIDER) private readonly db: DBSchema,
    private readonly cache: Cache
  ) {}

  async clientExistsForOwner(ownerId: number, clientId: string): Promise<boolean> {
    const [client] = await this.db
      .select({ id: syncClients.id })
      .from(syncClients)
      .where(and(eq(syncClients.ownerId, ownerId), eq(syncClients.id, clientId)))
      .limit(1)
    return !!client?.id
  }

  async getOrCreateClient(ownerId: number, clientId: string, info: SyncClientInfo, ip: string): Promise<string> {
    const client = await this.getClient(clientId, ownerId)
    if (client) {
      if (currentTimeStamp() < client.tokenExpiration) {
        return client.token
      }
      // renew token if it has expired
      const token = crypto.randomUUID()
      dbCheckAffectedRows(
        await this.db
          .update(syncClients)
          .set({
            token: token,
            tokenExpiration: currentTimeStamp() + convertHumanTimeToSeconds(CLIENT_TOKEN_EXPIRATION_TIME)
          })
          .where(and(eq(syncClients.ownerId, ownerId), eq(syncClients.id, clientId)))
          .limit(1),
        1
      )
      return token
    } else {
      // create client
      const token = crypto.randomUUID()
      dbCheckAffectedRows(
        await this.db.insert(syncClients).values({
          id: clientId,
          ownerId: ownerId,
          token: token,
          tokenExpiration: currentTimeStamp() + convertHumanTimeToSeconds(CLIENT_TOKEN_EXPIRATION_TIME),
          info: info,
          currentAccess: new Date(),
          currentIp: ip
        } as SyncClient),
        1
      )
      return token
    }
  }

  async getClient(clientId: string, ownerId?: number, token?: string): Promise<SyncClient> {
    const where: SQL[] = [
      eq(syncClients.id, clientId),
      ...(ownerId ? [eq(syncClients.ownerId, ownerId)] : []),
      ...(token ? [eq(syncClients.token, token)] : [])
    ]
    const [client] = await this.db
      .select({
        id: syncClients.id,
        ownerId: syncClients.ownerId,
        token: syncClients.token,
        tokenExpiration: syncClients.tokenExpiration,
        info: syncClients.info,
        enabled: syncClients.enabled,
        currentAccess: syncClients.currentAccess,
        currentIp: syncClients.currentIp,
        lastAccess: syncClients.lastAccess,
        lastIp: syncClients.lastIp,
        createdAt: syncClients.createdAt
      })
      .from(syncClients)
      .where(and(...where))
      .limit(1)
    return client
  }

  async getClients(owner: UserModel): Promise<SyncClientPaths[]> {
    const clientId = owner.clientId || null
    return this.db
      .select({
        id: syncClients.id,
        tokenExpiration: syncClients.tokenExpiration,
        info: syncClients.info,
        enabled: syncClients.enabled,
        currentAccess: syncClients.currentAccess,
        currentIp: syncClients.currentIp,
        lastAccess: syncClients.lastAccess,
        lastIp: syncClients.lastIp,
        createdAt: syncClients.createdAt,
        isCurrentClient: sql<boolean>`IF (${clientId} IS NOT NULL AND ${syncClients.id} = ${clientId}, 1, 0)`.mapWith(Boolean),
        paths: concatDistinctObjectsInArray(syncPaths.id, {
          id: syncPaths.id,
          settings: syncPaths.settings,
          createdAt: syncPaths.createdAt
        })
      })
      .from(syncClients)
      .leftJoin(syncPaths, eq(syncPaths.clientId, syncClients.id))
      .where(eq(syncClients.ownerId, owner.id))
      .groupBy(syncClients.id)
      .orderBy(desc(syncClients.currentAccess))
  }

  async deleteClient(ownerId: number, clientId: string) {
    dbCheckAffectedRows(
      await this.db
        .delete(syncClients)
        .where(and(eq(syncClients.ownerId, ownerId), eq(syncClients.id, clientId)))
        .limit(1),
      1
    )
  }

  async renewClientTokenAndExpiration(clientId: string, token: string, expiration: number) {
    dbCheckAffectedRows(await this.db.update(syncClients).set({ token: token, tokenExpiration: expiration }).where(eq(syncClients.id, clientId)), 1)
  }

  async updateClientInfo(client: SyncClient, info: SyncClientInfo, ip: string) {
    await this.db
      .update(syncClients)
      .set({
        lastAccess: client.currentAccess,
        currentAccess: new Date(),
        lastIp: client.currentIp,
        currentIp: ip,
        info: info
      } as SyncClient)
      .where(eq(syncClients.id, client.id))
  }

  getPaths(clientId: string): Promise<{ id: number; settings: SyncPathSettings; remotePath: string }[]> {
    const shareFile: any = alias(files, 'shareFile')
    const spaceRootFile: any = alias(files, 'spaceRootFile')
    return this.db
      .select({
        id: syncPaths.id,
        remotePath: sql<string>`
          CASE WHEN ${syncPaths.ownerId} IS NOT NULL THEN CONCAT_WS('/', ${SYNC_REPOSITORY.PERSONAL}, ${filePathSQL(files)})
               WHEN ${syncPaths.spaceId} IS NOT NULL THEN CONCAT_WS('/', 
                     ${SYNC_REPOSITORY.SPACES}, 
                     ${spaces.alias}, 
                     CASE WHEN ${syncPaths.spaceRootId} IS NULL 
                          THEN CONCAT_WS('/', IF (${files.path} = '.', NULL, ${files.path}), ${files.name})
                          ELSE
                            CASE WHEN ${syncPaths.fileId} IS NULL 
                                 THEN ${spacesRoots.alias}
                            ELSE
                              IF (${spacesRoots.externalPath} IS NOT NULL, 
                                CONCAT_WS('/', ${spacesRoots.alias}, IF (${files.path} = '.', NULL, ${files.path}), ${files.name}), 
                                CONCAT_WS('/', REGEXP_REPLACE(${files.path}, ${filePathSQL(spaceRootFile)}, ${spacesRoots.alias}), ${files.name})
                              )
                            END
                     END
                )
               WHEN ${syncPaths.shareId} IS NOT NULL THEN CONCAT_WS('/',
                    ${SYNC_REPOSITORY.SHARES},
                    CASE WHEN ${syncPaths.fileId} IS NULL THEN ${shares.alias}
                         ELSE 
                         IF (${shareFile.id} IS NOT NULL,
                              IF (${files.id} = ${shareFile.id}, NULL, REGEXP_REPLACE(${files.path}, ${filePathSQL(shareFile)}, ${shares.alias})),
                              CONCAT_WS('/', ${shares.alias}, IF (${files.path} = '.', NULL, ${files.path}))
                         )
                    END,
                    IF (${files.id} = ${shareFile.id}, ${shares.name}, ${files.name})
                    )
               ELSE NULL
          END
        `.as('remotePath'),
        settings: syncPaths.settings
      })
      .from(syncPaths)
      .leftJoin(files, eq(files.id, syncPaths.fileId))
      .leftJoin(spaces, eq(spaces.id, syncPaths.spaceId))
      .leftJoin(spacesRoots, eq(spacesRoots.id, syncPaths.spaceRootId))
      .leftJoin(spaceRootFile, eq(spaceRootFile.id, spacesRoots.fileId))
      .leftJoin(shares, eq(shares.id, syncPaths.shareId))
      .leftJoin(shareFile, eq(shareFile.id, shares.fileId))
      .where(eq(syncPaths.clientId, clientId))
  }

  @CacheDecorator(900)
  async getPathSettings(clientId: string, pathId: number): Promise<SyncPathSettings> {
    const [path] = await this.db
      .select({
        settings: syncPaths.settings
      })
      .from(syncPaths)
      .where(and(eq(syncPaths.clientId, clientId), eq(syncPaths.id, pathId)))
      .limit(1)
    return path ? path.settings : null
  }

  async createPath(clientId: string, dbProps: SyncDBProps, settings: SyncPathSettings): Promise<SyncPath['id']> {
    return dbGetInsertedId(await this.db.insert(syncPaths).values({ clientId: clientId, settings: settings, ...dbProps } as SyncPath))
  }

  async deletePath(clientId: string, pathId: number): Promise<void> {
    dbCheckAffectedRows(await this.db.delete(syncPaths).where(and(eq(syncPaths.id, pathId), eq(syncPaths.clientId, clientId))), 1)
  }

  async updatePathSettings(clientId: string, pathId: number, settings: SyncPathSettings) {
    dbCheckAffectedRows(
      await this.db
        .update(syncPaths)
        .set({ settings: settings })
        .where(and(eq(syncPaths.id, pathId), eq(syncPaths.clientId, clientId))),
      1
    )
  }

  clearCachePathSettings(clientId: string, pathId: number): void {
    this.cache.del(this.cache.genSlugKey(this.constructor.name, this.getPathSettings.name, clientId, pathId)).catch((e: Error) => console.error(e))
  }
}
