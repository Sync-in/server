/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { sql } from 'drizzle-orm'
import { AnyMySqlColumn, bigint, boolean, datetime, index, mysqlTable, tinyint, uniqueIndex, varchar } from 'drizzle-orm/mysql-core'
import { files } from '../../files/schemas/files.schema'
import { spacesRoots } from '../../spaces/schemas/spaces-roots.schema'
import { spaces } from '../../spaces/schemas/spaces.schema'
import { users } from '../../users/schemas/users.schema'

/*
  type:
      0: common
      1: share link
  ownerId: share owner
  parentId: parent share
  spaceId:
    - used to save the provenance of the space
  spaceRootId:
    - used to save the provenance of the space root (spaceId required)
    - if fileId is not defined, the share becomes a gateway to the space root (avoids to create entry file)
    - if fileId is defined, the spaceId and spaceRootId are used to translate the file location (in combination with file.path)
  fileId is defined if a file is related:
    - file.ownerId : personal space case
    - file.spaceId : space case
    - file.spaceId & file.spaceExternalRootId : space with an external root
    - file.shareExternalId: external path from share
  externalPath: if define the share use an external location
  alias: used to navigate over web & webdav, must be unique
  name: set by user and showed to others

  parent: if the share is a child share:
    - parentId is required
    - spaceId & spaceRootId must have the same value as their parents
    - fileId is required when the file is inside the parent share
    - fileId is not required when child share is directly linked to parent share (with a space root or an external path)
    - if the share has an external path: file.shareExternalId must match with the first parent share

  storageQuota:
    0 : no storage
    null : unlimited
    other: limited to value

  Storage properties are only used for shares that have an external path.
*/

export const shares = mysqlTable(
  'shares',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    ownerId: bigint('ownerId', { mode: 'number', unsigned: true }).references(() => users.id, { onDelete: 'cascade' }),
    parentId: bigint('parentId', { mode: 'number', unsigned: true }).references((): AnyMySqlColumn => shares.id, { onDelete: 'cascade' }),
    spaceId: bigint('spaceId', { mode: 'number', unsigned: true }).references(() => spaces.id, { onDelete: 'cascade' }),
    spaceRootId: bigint('spaceRootId', { mode: 'number', unsigned: true }).references((): AnyMySqlColumn => spacesRoots.id, { onDelete: 'cascade' }),
    fileId: bigint('fileId', { mode: 'number', unsigned: true }).references((): AnyMySqlColumn => files.id, { onDelete: 'cascade' }),
    externalPath: varchar('externalPath', { length: 4096 }),
    type: tinyint('type', { unsigned: true }).default(0).notNull(),
    alias: varchar('alias', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    description: varchar('description', { length: 255 }),
    storageUsage: bigint('storageUsage', { mode: 'number', unsigned: true }).default(0).notNull(),
    storageQuota: bigint('storageQuota', { mode: 'number', unsigned: true }),
    storageIndexing: boolean('storageIndexing').default(true).notNull(),
    createdAt: datetime('createdAt', { mode: 'date' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    modifiedAt: datetime('modifiedAt', { mode: 'date' }).default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
    disabledAt: datetime('disabledAt', { mode: 'date' })
  },
  (table) => [
    uniqueIndex('alias_idx').on(table.alias),
    index('parent_idx').on(table.parentId),
    index('owner_idx').on(table.ownerId),
    index('space_idx').on(table.spaceId),
    index('space_root_idx').on(table.spaceRootId),
    index('file_idx').on(table.fileId),
    index('type_idx').on(table.type)
  ]
)
