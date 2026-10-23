import { sql, type SQLWrapper } from 'drizzle-orm'
import { MySqlDialect } from 'drizzle-orm/mysql-core'
import { drizzle } from 'drizzle-orm/mysql2'
import type { DBSchema } from '../../../infrastructure/database/interfaces/database.interface.js'
import { FilesFavoritesQueries } from './files-favorites-queries.service.js'

describe(FilesFavoritesQueries.name, () => {
  const dialect = new MySqlDialect()
  const service = new FilesFavoritesQueries(drizzle.mock() as unknown as DBSchema)

  it('builds the space UNION ALL using schema collations without query-level overrides', () => {
    const query = service.getFavoriteLocationsFromSpaces(7, [11]) as unknown as SQLWrapper
    const statement = dialect.sqlToQuery(sql`${query}`).sql

    expect(statement.match(/union all/gi)).toHaveLength(1)
    expect(statement).not.toContain('COLLATE')
    for (const operand of [
      '`spaces`.`alias`',
      '`favoriteDirectSpaceRoot`.`alias`',
      '`favoriteAnchoredSpaceRoot`.`alias`',
      '`favoriteAnchoredSpaceRoot`.`name`'
    ]) {
      expect(statement).toContain(operand)
    }
  })

  it('builds every share UNION ALL branch without query-level collation overrides', () => {
    const query = service.getFavoriteLocationsFromShares(7, [13]) as unknown as SQLWrapper
    const statement = dialect.sqlToQuery(sql`${query}`).sql

    expect(statement.match(/union all/gi)).toHaveLength(3)
    expect(statement).not.toContain('COLLATE')
    expect(statement).toContain('`shares`.`alias`')
    expect(statement).toContain('`shares`.`name`')
  })
})
