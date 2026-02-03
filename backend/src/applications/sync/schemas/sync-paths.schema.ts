import { sql } from 'drizzle-orm'
import { bigint, char, datetime, index, mysqlTable } from 'drizzle-orm/mysql-core'
import { jsonColumn } from '../../../infrastructure/database/columns'
import { files } from '../../files/schemas/files.schema'
import { shares } from '../../shares/schemas/shares.schema'
import { spacesRoots } from '../../spaces/schemas/spaces-roots.schema'
import { spaces } from '../../spaces/schemas/spaces.schema'
import { users } from '../../users/schemas/users.schema'
import { SyncPathSettings } from '../interfaces/sync-path.interface'
import { syncClients } from './sync-clients.schema'

/*
  ownerId: sync personal space partially (fileId is required)
  spaceId: sync space partially (fileId or spaceRootId are required)
  spaceRootId: sync all the space root or partially if fileId is specified (spaceId required)
  shareId: sync all the share or partially (fileId is required)
  fileId: sync a specific directory (ownerId, spaceId (or spaceId with spaceRootId), shareId are required)
*/

export const syncPaths = mysqlTable(
  'sync_paths',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    clientId: char('clientId', { length: 36 })
      .references(() => syncClients.id, { onDelete: 'cascade' })
      .notNull(),
    ownerId: bigint('ownerId', { mode: 'number', unsigned: true }).references(() => users.id, { onDelete: 'cascade' }),
    spaceId: bigint('spaceId', { mode: 'number', unsigned: true }).references(() => spaces.id, { onDelete: 'cascade' }),
    spaceRootId: bigint('spaceRootId', { mode: 'number', unsigned: true }).references(() => spacesRoots.id, { onDelete: 'cascade' }),
    shareId: bigint('shareId', { mode: 'number', unsigned: true }).references(() => shares.id, { onDelete: 'cascade' }),
    fileId: bigint('fileId', { mode: 'number', unsigned: true }).references(() => files.id, { onDelete: 'cascade' }),
    settings: jsonColumn<SyncPathSettings>()('settings').notNull(),
    createdAt: datetime('createdAt', { mode: 'date' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull()
  },
  (table) => [
    index('client_idx').on(table.clientId),
    index('owner_idx').on(table.ownerId),
    index('space_idx').on(table.spaceId),
    index('space_root_idx').on(table.spaceRootId),
    index('share_idx').on(table.shareId),
    index('file_idx').on(table.fileId)
  ]
)
