import { bigint, index, mysqlTable, varchar } from 'drizzle-orm/mysql-core'
import { shares } from '../../shares/schemas/shares.schema'
import { spaces } from '../../spaces/schemas/spaces.schema'
import { users } from '../../users/schemas/users.schema'

export const filesRecents = mysqlTable(
  'files_recents',
  {
    id: bigint('id', { mode: 'number', unsigned: false }),
    ownerId: bigint('ownerId', { mode: 'number', unsigned: true }).references(() => users.id, { onDelete: 'cascade' }),
    spaceId: bigint('spaceId', { mode: 'number', unsigned: true }).references(() => spaces.id, { onDelete: 'cascade' }),
    shareId: bigint('shareId', { mode: 'number', unsigned: true }).references(() => shares.id, { onDelete: 'cascade' }),
    path: varchar('path', { length: 4096 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    mime: varchar('mime', { length: 255 }),
    mtime: bigint('mtime', { mode: 'number', unsigned: true }).notNull()
  },
  (table) => [
    index('owner_idx').on(table.ownerId),
    index('space_idx').on(table.spaceId),
    index('share_idx').on(table.shareId),
    index('mtime_idx').on(table.mtime),
    index('path_idx').on(table.path)
  ]
)
