import { MySqlDialect } from 'drizzle-orm/mysql-core'
import type { Cache } from '../../../infrastructure/cache/cache.service'
import { LinksQueries } from './links-queries.service'

describe(LinksQueries.name, () => {
  let service: LinksQueries
  let updateWhere: ReturnType<typeof vi.fn>
  let updateLimit: ReturnType<typeof vi.fn>

  beforeEach(() => {
    updateLimit = vi.fn().mockResolvedValue([{ affectedRows: 1 }])
    updateWhere = vi.fn().mockReturnValue({ limit: updateLimit })
    const set = vi.fn().mockReturnValue({ where: updateWhere })
    const update = vi.fn().mockReturnValue({ set })
    service = new LinksQueries({ update } as any, {} as Cache)
  })

  it('atomically consumes an access only while the current counter is below the limit', async () => {
    await expect(service.consumeLinkAccess('uuid-123')).resolves.toBe(true)
    expect(updateLimit).toHaveBeenCalledWith(1)

    const condition = new MySqlDialect().sqlToQuery(updateWhere.mock.calls[0][0])
    expect(condition.sql).toContain('`links`.`uuid` = ?')
    expect(condition.sql).toContain('`links`.`limitAccess` = ?')
    expect(condition.sql).toContain('`links`.`nbAccess` < `links`.`limitAccess`')
    expect(condition.params).toEqual(['uuid-123', 0])

    updateLimit.mockResolvedValueOnce([{ affectedRows: 0 }])
    await expect(service.consumeLinkAccess('uuid-123')).resolves.toBe(false)
  })
})
