import { CACHE_AUTH_WEBDAV_PREFIX } from '../../../authentication/constants/cache.js'
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

describe(`${UsersQueries.name}.WebDAVAuthCache`, () => {
  it('clears only cached WebDAV authentications belonging to the targeted users', async () => {
    const cache = {
      keys: vi
        .fn()
        .mockResolvedValue([
          `${CACHE_AUTH_WEBDAV_PREFIX}-matching`,
          `${CACHE_AUTH_WEBDAV_PREFIX}-other`,
          `${CACHE_AUTH_WEBDAV_PREFIX}-second-match`,
          `${CACHE_AUTH_WEBDAV_PREFIX}-missing`
        ]),
      get: vi.fn().mockResolvedValueOnce({ id: 42 }).mockResolvedValueOnce({ id: 43 }).mockResolvedValueOnce({ id: 44 }).mockResolvedValueOnce(null),
      mdel: vi.fn().mockResolvedValue(true)
    } as unknown as Cache
    const usersQueries = new UsersQueries({} as DBSchema, cache)

    await usersQueries.clearWebDAVAuthCache([42, 44])

    expect(cache.keys).toHaveBeenCalledWith(`${CACHE_AUTH_WEBDAV_PREFIX}-*`)
    expect(cache.mdel).toHaveBeenCalledWith([`${CACHE_AUTH_WEBDAV_PREFIX}-matching`, `${CACHE_AUTH_WEBDAV_PREFIX}-second-match`])
  })

  it('invalidates WebDAV authentication after an auth-sensitive user update', async () => {
    const where = vi.fn().mockResolvedValue([{ affectedRows: 1 }])
    const set = vi.fn().mockReturnValue({ where })
    const db = { update: vi.fn().mockReturnValue({ set }) } as unknown as DBSchema
    const usersQueries = new UsersQueries(db, {} as Cache)
    const clearWebDAVAuthCache = vi.spyOn(usersQueries, 'clearWebDAVAuthCache').mockResolvedValue(undefined)

    await expect(usersQueries.updateUserOrGuest(42, { password: 'hash' })).resolves.toBe(true)
    await expect(usersQueries.updateUserOrGuest(42, { language: 'fr' })).resolves.toBe(true)

    expect(clearWebDAVAuthCache).toHaveBeenCalledTimes(1)
    expect(clearWebDAVAuthCache).toHaveBeenCalledWith(42)
  })
})
