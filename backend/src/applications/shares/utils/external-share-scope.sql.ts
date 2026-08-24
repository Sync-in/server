import { SQL, sql, SQLWrapper } from 'drizzle-orm'
import { alias } from 'drizzle-orm/mysql-core'
import { shares } from '../schemas/shares.schema'

export interface ExternalShareScopeSQL {
  table: SQL
  targetShareId: SQL<number>
  storageShareId: SQL<number | null>
}

interface ExternalShareScopeOptions {
  mapExternalRootToSelf?: boolean
  oneTargetPerStorage?: boolean
}

export function externalShareScopeSQL(targetShares: SQLWrapper, scopeAlias: string, options: ExternalShareScopeOptions = {}): ExternalShareScopeSQL {
  // Maps each target share to the highest external ancestor used by `files.shareExternalId`. The target query must select, in this order, `id`,
  // `parentId` and `externalPath`.
  const parentShareAlias = `${scopeAlias}ParentShare`
  const parentShare: any = alias(shares, parentShareAlias)
  const resolvedTargetShareId = sql<number>`${sql.identifier('resolvedShares')}.${sql.identifier('targetShareId')}`
  const resolvedStorageShareId = sql<number | null>`${sql.identifier('resolvedShares')}.${sql.identifier('storageShareId')}`
  const ancestorTargetFilter =
    options.mapExternalRootToSelf === false ? sql`WHERE targetShares.externalPath IS NOT NULL AND targetShares.parentId IS NOT NULL` : sql``
  const externalRootTargetFilter = options.mapExternalRootToSelf === false ? sql`AND ancestors.id <> ancestors.targetShareId` : sql``
  const selectScope = options.oneTargetPerStorage
    ? sql`
        SELECT COALESCE(
                 MAX(IF (${resolvedTargetShareId} = ${resolvedStorageShareId}, ${resolvedTargetShareId}, NULL)),
                 MIN(${resolvedTargetShareId})
               ) AS targetShareId,
               ${resolvedStorageShareId} AS storageShareId
        FROM resolvedShares
        WHERE ${resolvedStorageShareId} IS NOT NULL
        GROUP BY ${resolvedStorageShareId}
      `
    : sql`
        SELECT ${resolvedTargetShareId} AS targetShareId,
               ${resolvedStorageShareId} AS storageShareId
        FROM resolvedShares
      `
  const table = sql`
    (
      WITH RECURSIVE targetShares (id, parentId, externalPath) AS
                       (${targetShares}),
                     ancestors (targetShareId, id, parentId, externalPath) AS
                       (SELECT targetShares.id,
                               targetShares.id,
                               targetShares.parentId,
                               targetShares.externalPath
                        FROM targetShares
                        ${ancestorTargetFilter}
                        UNION
                        SELECT ancestors.targetShareId,
                               ${parentShare.id},
                               ${parentShare.parentId},
                               ${parentShare.externalPath}
                        FROM ${shares} AS ${sql.identifier(parentShareAlias)}
                               INNER JOIN ancestors ON ${parentShare.id} = ancestors.parentId
                        WHERE ${parentShare.externalPath} IS NOT NULL),
                     rootShares (targetShareId, storageShareId) AS
                       (SELECT ancestors.targetShareId,
                               ancestors.id
                        FROM ancestors
                        WHERE ancestors.parentId IS NULL
                          AND ancestors.externalPath IS NOT NULL
                          ${externalRootTargetFilter}),
                     resolvedShares (targetShareId, storageShareId) AS
                       (SELECT targetShares.id,
                               IF (targetShares.externalPath IS NULL, NULL, rootShares.storageShareId)
                        FROM targetShares
                               LEFT JOIN rootShares ON rootShares.targetShareId = targetShares.id
                        WHERE targetShares.externalPath IS NULL
                           OR targetShares.parentId IS NULL
                           OR rootShares.storageShareId IS NOT NULL)
      ${selectScope}
    ) AS ${sql.identifier(scopeAlias)}
  `

  return {
    table,
    targetShareId: sql<number>`${sql.identifier(scopeAlias)}.${sql.identifier('targetShareId')}`,
    storageShareId: sql<number | null>`${sql.identifier(scopeAlias)}.${sql.identifier('storageShareId')}`
  }
}
