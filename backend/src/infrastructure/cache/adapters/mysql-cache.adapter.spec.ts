import { Logger } from '@nestjs/common'
import { SQL } from 'drizzle-orm'
import { MySqlDialect } from 'drizzle-orm/mysql-core'
import type { Availability } from '../../availability/availability.service.js'
import type { DBSchema } from '../../database/interfaces/database.interface.js'
import type { SchedulerManager } from '../../scheduler/scheduler-manager.service.js'
import { MysqlCacheAdapter } from './mysql-cache.adapter.js'

describe(MysqlCacheAdapter.name, () => {
  Logger.overrideLogger(['fatal'])

  function createAdapter(
    options: {
      insertValues?: ReturnType<typeof vi.fn>
      updateWhere?: ReturnType<typeof vi.fn>
      deleteWhere?: ReturnType<typeof vi.fn>
    } = {}
  ) {
    const transaction = vi.fn()
    const insertValues = options.insertValues ?? vi.fn().mockResolvedValue([{ affectedRows: 1 }])
    const updateWhere = options.updateWhere ?? vi.fn().mockResolvedValue([{ affectedRows: 0 }])
    const deleteWhere = options.deleteWhere ?? vi.fn().mockResolvedValue([{ affectedRows: 0 }])
    const updateSet = vi.fn(() => ({ where: updateWhere }))
    const db = {
      transaction,
      insert: vi.fn(() => ({ values: insertValues })),
      update: vi.fn(() => ({ set: updateSet })),
      delete: vi.fn(() => ({ where: deleteWhere }))
    }
    const adapter = new MysqlCacheAdapter(
      db as unknown as DBSchema,
      {} as SchedulerManager,
      {
        register: vi.fn()
      } as unknown as Availability
    )
    return { adapter, transaction, insertValues, updateSet, updateWhere, deleteWhere }
  }

  function databaseError(code: string) {
    return new Error('query failed', { cause: Object.assign(new Error(code), { code }) })
  }

  function expectExactVersionPredicate(predicate: SQL, key: string, version: string) {
    const query = new MySqlDialect().sqlToQuery(predicate)
    const querySql = query.sql.toLowerCase()
    expect(querySql).toContain('`cache`.`key_hash` = unhex(sha2(?, 256))')
    expect(querySql).toContain('`cache`.`key` = ?')
    expect(querySql).toContain("json_type(`cache`.`value`) = 'object'")
    expect(querySql).toContain("json_type(json_extract(`cache`.`value`, '$.version')) = 'string'")
    expect(querySql).toContain('binary json_unquote')
    expect(query.params).toEqual(expect.arrayContaining([key, key, version]))
  }

  it('creates a versioned value when the key is absent', async () => {
    const value = { version: 'version-1', locks: [] }
    const { adapter, transaction, insertValues } = createAdapter()

    await expect(adapter.compareAndSwap({ key: 'lock-state', expectedVersion: null, value, ttl: 60 })).resolves.toBe(true)

    expect(transaction).not.toHaveBeenCalled()
    expect(insertValues).toHaveBeenCalledOnce()
    const inserted = insertValues.mock.calls[0][0] as { key: string; value: unknown; expiration: SQL }
    expect(inserted).toMatchObject({ key: 'lock-state', value })
    const expiration = new MySqlDialect().sqlToQuery(inserted.expiration)
    expect(expiration.sql).toContain('CEIL(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) + ?')
    expect(expiration.params).toEqual([60])
  })

  it('returns false without writing when an absent expectation finds a live value', async () => {
    const insertValues = vi.fn().mockRejectedValue(databaseError('ER_DUP_ENTRY'))
    const updateWhere = vi.fn().mockResolvedValue([{ affectedRows: 0 }])
    const { adapter, transaction } = createAdapter({ insertValues, updateWhere })

    await expect(
      adapter.compareAndSwap({
        key: 'lock-state',
        expectedVersion: null,
        value: { version: 'version-2' }
      })
    ).resolves.toBe(false)

    expect(insertValues).toHaveBeenCalledTimes(2)
    expect(updateWhere).toHaveBeenCalledOnce()
    expect(transaction).not.toHaveBeenCalled()
  })

  it('updates a live value whose embedded version matches', async () => {
    const updateWhere = vi.fn().mockResolvedValue([{ affectedRows: 1 }])
    const value = { version: 'version-2', locks: [{ lockId: 'lock-1' }] }

    const { adapter, transaction, updateSet } = createAdapter({ updateWhere })

    await expect(adapter.compareAndSwap({ key: 'lock-state', expectedVersion: 'version-1', value, ttl: 120 })).resolves.toBe(true)

    expect(updateSet).toHaveBeenCalledWith({ value, expiration: expect.any(SQL) })
    expectExactVersionPredicate(updateWhere.mock.calls[0][0] as SQL, 'lock-state', 'version-1')
    expect(transaction).not.toHaveBeenCalled()
  })

  it('returns false without writing when the version is stale', async () => {
    const updateWhere = vi.fn().mockResolvedValue([{ affectedRows: 0 }])
    const { adapter, transaction } = createAdapter({ updateWhere })

    await expect(
      adapter.compareAndSwap({
        key: 'lock-state',
        expectedVersion: 'version-1',
        value: { version: 'version-3' }
      })
    ).resolves.toBe(false)

    expectExactVersionPredicate(updateWhere.mock.calls[0][0] as SQL, 'lock-state', 'version-1')
    expect(transaction).not.toHaveBeenCalled()
  })

  it('treats an expired row as absent and replaces it in place', async () => {
    const insertValues = vi.fn().mockRejectedValue(databaseError('ER_DUP_ENTRY'))
    const updateWhere = vi.fn().mockResolvedValue([{ affectedRows: 1 }])
    const { adapter, transaction, updateSet } = createAdapter({ insertValues, updateWhere })
    const value = { version: 'version-1', locks: [] }

    await expect(adapter.compareAndSwap({ key: 'lock-state', expectedVersion: null, value })).resolves.toBe(true)

    expect(updateSet).toHaveBeenCalledWith({ value, expiration: expect.any(SQL) })
    expect(insertValues).toHaveBeenCalledOnce()
    expect(transaction).not.toHaveBeenCalled()
  })

  it('deletes a value whose embedded version matches', async () => {
    const deleteWhere = vi.fn().mockResolvedValue([{ affectedRows: 1 }])
    const { adapter, transaction } = createAdapter({ deleteWhere })

    await expect(adapter.compareAndSwap({ key: 'lock-state', expectedVersion: 'version-1' })).resolves.toBe(true)

    expectExactVersionPredicate(deleteWhere.mock.calls[0][0] as SQL, 'lock-state', 'version-1')
    expect(transaction).not.toHaveBeenCalled()
  })

  it('returns false when a concurrent transaction inserts the initially absent key', async () => {
    const insertValues = vi.fn().mockRejectedValue(databaseError('ER_DUP_ENTRY'))
    const { adapter, transaction } = createAdapter({ insertValues })

    await expect(
      adapter.compareAndSwap({
        key: 'lock-state',
        expectedVersion: null,
        value: { version: 'version-1' }
      })
    ).resolves.toBe(false)

    expect(insertValues).toHaveBeenCalledTimes(2)
    expect(transaction).not.toHaveBeenCalled()
  })

  it('creates the value when the conflicting row disappears before the conditional update', async () => {
    const insertValues = vi
      .fn()
      .mockRejectedValueOnce(databaseError('ER_DUP_ENTRY'))
      .mockResolvedValueOnce([{ affectedRows: 1 }])
    const { adapter, transaction } = createAdapter({ insertValues })

    await expect(
      adapter.compareAndSwap({
        key: 'lock-state',
        expectedVersion: null,
        value: { version: 'version-1' }
      })
    ).resolves.toBe(true)

    expect(insertValues).toHaveBeenCalledTimes(2)
    expect(transaction).not.toHaveBeenCalled()
  })

  it('retries a deadlock once', async () => {
    const insertValues = vi
      .fn()
      .mockRejectedValueOnce(databaseError('ER_LOCK_DEADLOCK'))
      .mockResolvedValueOnce([{ affectedRows: 1 }])
    const { adapter, transaction } = createAdapter({ insertValues })
    const warn = vi.spyOn((adapter as any).logger, 'warn').mockImplementation(() => undefined)

    await expect(adapter.compareAndSwap({ key: 'lock-state', expectedVersion: null, value: { version: 'version-1' } })).resolves.toBe(true)
    expect(insertValues).toHaveBeenCalledTimes(2)
    expect(transaction).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith({
      tag: 'compareAndSwap',
      msg: 'Retrying cache compare-and-swap after a database deadlock'
    })
  })

  it('rejects invalid values and TTLs before opening a transaction', async () => {
    const { adapter, transaction } = createAdapter()

    await expect(adapter.compareAndSwap({ key: 'lock-state', expectedVersion: null, value: { locks: [] } })).rejects.toThrow(
      'object with a string version'
    )
    await expect(adapter.compareAndSwap({ key: 'lock-state', expectedVersion: null, value: { version: 'version-1' }, ttl: -1 })).rejects.toThrow(
      'Invalid cache compare-and-swap TTL'
    )
    expect(transaction).not.toHaveBeenCalled()
  })
})
