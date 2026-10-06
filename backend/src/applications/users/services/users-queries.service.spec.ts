import type { Cache } from '../../../infrastructure/cache/cache.service.js'
import type { DBSchema } from '../../../infrastructure/database/interfaces/database.interface.js'
import { UsersQueries } from './users-queries.service.js'

describe(`${UsersQueries.name}.from`, () => {
  it('trims the identifier before searching by login or email', async () => {
    const execute = vi.fn().mockResolvedValue([])
    const query = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      prepare: vi.fn().mockReturnValue({ execute })
    }
    const db = { select: vi.fn().mockReturnValue(query) } as unknown as DBSchema
    const usersQueries = new UsersQueries(db, {} as Cache)

    await usersQueries.from(null, ' alice')

    expect(execute).toHaveBeenCalledWith({ loginOrEmail: 'alice' })
  })
})
