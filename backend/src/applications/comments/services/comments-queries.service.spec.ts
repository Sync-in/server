import { drizzle } from 'drizzle-orm/mysql2'
import type { DBSchema } from '../../../infrastructure/database/interfaces/database.interface.js'
import type { SharesQueries } from '../../shares/services/shares-queries.service.js'
import type { SpacesQueries } from '../../spaces/services/spaces-queries.service.js'
import { CommentsQueries } from './comments-queries.service.js'

describe(CommentsQueries.name, () => {
  const service = new CommentsQueries(drizzle.mock() as unknown as DBSchema, {} as SpacesQueries, {} as SharesQueries)

  it('builds space recents including NULLIF without query-level collation overrides', () => {
    const { sql: statement } = service.getRecentsFromSpaces(7, [11], 20).toSQL()

    expect(statement).toContain("NULLIF(CONCAT_WS('/', IF (`files`.`spaceExternalRootId` = `spaces_roots`.`id`, `spaces_roots`.`alias`, NULL)")
    expect(statement).not.toContain('COLLATE')
    expect(statement).toContain('`spaces`.`alias`')
    expect(statement).toContain('`spaces_roots`.`name`')
  })

  it('builds share recents without query-level collation overrides', () => {
    const { sql: statement } = service.getRecentsFromShares(7, [13], 20).toSQL()

    expect(statement).not.toContain('COLLATE')
    expect(statement).toContain('`shares`.`alias`')
    expect(statement).toContain('`shares`.`name`')
  })
})
