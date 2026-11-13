import { Logger } from '@nestjs/common'
import { SQL } from 'drizzle-orm'
import { MySqlDialect } from 'drizzle-orm/mysql-core'
import type { Availability } from '../../availability/availability.service.js'
import type { DBSchema } from '../../database/interfaces/database.interface.js'
import type { SchedulerManager } from '../../scheduler/scheduler-manager.service.js'
import { CACHE_REVISION_MAX_MUTATIONS, type CacheRevisionCommit, type CacheRevisionMutationCommit } from '../interfaces/cache-revision.interface.js'
import { MysqlCacheAdapter } from './mysql-cache.adapter.js'

describe(MysqlCacheAdapter.name, () => {
  Logger.overrideLogger(['fatal'])

  function createAdapter(transaction: unknown): MysqlCacheAdapter {
    return createAdapterFromDB({ transaction })
  }

  function createAdapterFromDB(db: unknown): MysqlCacheAdapter {
    return new MysqlCacheAdapter(db as DBSchema, {} as SchedulerManager, { register: vi.fn() } as unknown as Availability)
  }

  function createTransaction(
    entries: { key: string; value: unknown; expiration: number; now: number }[] = [],
    revisionAffectedRows = 1,
    mutationAffectedRows = 1
  ) {
    const updateWhere = vi.fn().mockResolvedValue([{ affectedRows: revisionAffectedRows }])
    const updateSet = vi.fn((_values: unknown) => ({ where: updateWhere }))
    const forUpdate = vi.fn().mockResolvedValue(entries)
    const orderBy = vi.fn(() => ({ for: forUpdate }))
    const select = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ orderBy }))
      }))
    }))
    const deleteWhere = vi.fn().mockResolvedValue([{ affectedRows: mutationAffectedRows }])
    const onDuplicateKeyUpdate = vi.fn((_values: unknown) => Promise.resolve([{ affectedRows: 1 }]))
    const insertedValues: unknown[] = []
    const insert = vi.fn(() => ({
      values: vi.fn((values: unknown) => {
        insertedValues.push(values)
        return { onDuplicateKeyUpdate }
      })
    }))
    const tx = {
      update: vi.fn(() => ({ set: updateSet })),
      select,
      delete: vi.fn(() => ({ where: deleteWhere })),
      insert
    }
    return { tx, updateSet, updateWhere, orderBy, forUpdate, deleteWhere, onDuplicateKeyUpdate, insertedValues }
  }

  it('reads the revision and matching values from one SQL statement', async () => {
    const selectedFields = { key: {}, value: {} }
    const rows = [
      { key: 'locks:revision', value: '"revision-1"' },
      { key: 'lock:a', value: { lockId: 'incarnation-a' } }
    ]
    const addSetOperators = vi.fn().mockResolvedValue(rows)
    const revisionQuery = { getSelectedFields: vi.fn(() => selectedFields), addSetOperators }
    const entriesQuery = { getSelectedFields: vi.fn(() => selectedFields) }
    const select = vi
      .fn()
      .mockImplementationOnce(() => ({ from: vi.fn(() => ({ where: vi.fn(() => revisionQuery) })) }))
      .mockImplementationOnce(() => ({ from: vi.fn(() => ({ where: vi.fn(() => entriesQuery) })) }))

    await expect(createAdapterFromDB({ select }).readRevisionSnapshot({ revisionKey: 'locks:revision', pattern: 'lock:*' })).resolves.toEqual({
      revision: 'revision-1',
      entries: [rows[1]]
    })
    expect(addSetOperators).toHaveBeenCalledOnce()
  })

  it('rejects a present revision row whose value is not a string', async () => {
    const selectedFields = { key: {}, value: {} }
    const addSetOperators = vi.fn().mockResolvedValue([{ key: 'locks:revision', value: null }])
    const revisionQuery = { getSelectedFields: vi.fn(() => selectedFields), addSetOperators }
    const entriesQuery = { getSelectedFields: vi.fn(() => selectedFields) }
    const select = vi
      .fn()
      .mockImplementationOnce(() => ({ from: vi.fn(() => ({ where: vi.fn(() => revisionQuery) })) }))
      .mockImplementationOnce(() => ({ from: vi.fn(() => ({ where: vi.fn(() => entriesQuery) })) }))

    await expect(createAdapterFromDB({ select }).readRevisionSnapshot({ revisionKey: 'locks:revision', pattern: 'lock:*' })).rejects.toThrow(
      'Invalid cache revision'
    )
  })

  it('commits a matching revision after checking every mutation and batches keys deterministically', async () => {
    const transactionState = createTransaction([{ key: 'lock:c', value: { lockId: 'incarnation-c' }, expiration: -1, now: 100 }])
    const transaction = vi.fn(async (callback: (tx: any) => Promise<void>) => callback(transactionState.tx))
    const adapter = createAdapter(transaction)

    const committed = await adapter.commitRevision({
      revisionKey: 'locks:revision',
      expectedRevision: 'revision-1',
      mutations: [
        { type: 'set', key: 'lock:z', value: undefined, ttl: 0, expect: 'absent' },
        { type: 'delete', key: 'lock:c', expect: 'present', expectedLockId: 'incarnation-c' },
        { type: 'set', key: 'lock:a', value: { lockId: 'incarnation-a' }, ttl: 30, expect: 'absent' }
      ]
    })

    expect(committed).toBe(true)
    expect(transactionState.updateSet).toHaveBeenCalledWith(expect.objectContaining({ expiration: -1 }))
    expect(transactionState.updateWhere).toHaveBeenCalledOnce()
    expect(transactionState.orderBy).toHaveBeenCalledOnce()
    expect(transactionState.forUpdate).toHaveBeenCalledWith('update')
    expect(transactionState.deleteWhere).toHaveBeenCalledOnce()
    expect(transactionState.onDuplicateKeyUpdate).toHaveBeenCalledOnce()
    const setValues = transactionState.insertedValues[0] as { key: string; value: unknown; expiration: number | SQL }[]
    expect(setValues.map(({ key }) => key)).toEqual(['lock:a', 'lock:z'])
    expect(setValues[0].expiration).toBeInstanceOf(SQL)
    expect(setValues[1]).toMatchObject({ value: null, expiration: -1 })
    const upsert = transactionState.onDuplicateKeyUpdate.mock.calls[0][0] as { set: { value: SQL; expiration: SQL } }
    const dialect = new MySqlDialect()
    const mutationSelect = (transactionState.tx.select.mock.calls as unknown[][])[0][0] as { now: SQL }
    expect(dialect.sqlToQuery(mutationSelect.now).sql).toBe('UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))')
    expect(dialect.sqlToQuery(upsert.set.value).sql).toBe('VALUES(`value`)')
    expect(dialect.sqlToQuery(upsert.set.expiration).sql).toBe('VALUES(`expiration`)')
  })

  it('rolls back the revision and returns false when a lock incarnation is stale', async () => {
    const transactionState = createTransaction([{ key: 'lock:a', value: { lockId: 'new-incarnation' }, expiration: -1, now: 100 }])
    const transaction = vi.fn(async (callback: (tx: any) => Promise<void>) => callback(transactionState.tx))
    const adapter = createAdapter(transaction)

    await expect(
      adapter.commitRevision({
        revisionKey: 'locks:revision',
        expectedRevision: 'revision-1',
        mutations: [{ type: 'delete', key: 'lock:a', expect: 'present', expectedLockId: 'old-incarnation' }]
      })
    ).resolves.toBe(false)
    expect(transactionState.tx.delete).not.toHaveBeenCalled()
    expect(transactionState.tx.insert).not.toHaveBeenCalled()
    expect(transactionState.tx.update).toHaveBeenCalledOnce()
  })

  it('uses database time when checking whether a required entry is still present', async () => {
    const transactionState = createTransaction([{ key: 'lock:a', value: { lockId: 'incarnation-a' }, expiration: 100, now: 100 }])
    const transaction = vi.fn(async (callback: (tx: any) => Promise<void>) => callback(transactionState.tx))

    await expect(
      createAdapter(transaction).commitRevision({
        revisionKey: 'locks:revision',
        expectedRevision: 'revision-1',
        mutations: [{ type: 'delete', key: 'lock:a', expect: 'present', expectedLockId: 'incarnation-a' }]
      })
    ).resolves.toBe(false)
    expect(transactionState.tx.delete).not.toHaveBeenCalled()
    expect(transactionState.tx.update).toHaveBeenCalledOnce()
  })

  it('returns false when the initially absent sidecar was concurrently created', async () => {
    const duplicate = Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY', errno: 1062 })
    const tx = { insert: vi.fn(() => ({ values: vi.fn().mockRejectedValue(new Error('query failed', { cause: duplicate })) })) }
    const transaction = vi.fn(async (callback: (tx: any) => Promise<void>) => callback(tx))
    const adapter = createAdapter(transaction)

    await expect(adapter.commitRevision({ revisionKey: 'locks:revision', expectedRevision: null, mutations: [] })).resolves.toBe(false)
  })

  it('returns false when the expected revision is stale', async () => {
    const transactionState = createTransaction([], 0)
    const transaction = vi.fn(async (callback: (tx: any) => Promise<void>) => callback(transactionState.tx))

    await expect(
      createAdapter(transaction).commitRevision({ revisionKey: 'locks:revision', expectedRevision: 'stale', mutations: [] })
    ).resolves.toBe(false)
    expect(transactionState.tx.update).toHaveBeenCalledOnce()
  })

  it('rotates the revision and deletes a known lock without reading the namespace', async () => {
    const transactionState = createTransaction()
    const transaction = vi.fn(async (callback: (tx: any) => Promise<void>) => callback(transactionState.tx))
    const command: CacheRevisionMutationCommit = {
      revisionKey: 'locks:revision',
      mutations: [{ type: 'delete', key: 'lock:a', expect: 'present', expectedLockId: 'incarnation-a' }]
    }

    await expect(createAdapter(transaction).mutateRevision(command)).resolves.toBe(true)
    expect(transactionState.tx.select).not.toHaveBeenCalled()
    expect(transactionState.tx.update).toHaveBeenCalledOnce()
    expect(transactionState.updateWhere).toHaveBeenCalledOnce()
    expect(transactionState.tx.insert).not.toHaveBeenCalled()
    expect(transactionState.deleteWhere).toHaveBeenCalledOnce()
  })

  it('returns false without mutating when the revision sidecar is missing', async () => {
    const transactionState = createTransaction([], 0)
    const transaction = vi.fn(async (callback: (tx: any) => Promise<void>) => callback(transactionState.tx))

    await expect(
      createAdapter(transaction).mutateRevision({
        revisionKey: 'locks:revision',
        mutations: [{ type: 'delete', key: 'lock:a', expect: 'present', expectedLockId: 'incarnation-a' }]
      })
    ).resolves.toBe(false)
    expect(transactionState.tx.update).toHaveBeenCalledOnce()
    expect(transactionState.tx.delete).not.toHaveBeenCalled()
    expect(transactionState.tx.insert).not.toHaveBeenCalled()
  })

  it('rolls back a direct mutation whose lock incarnation is stale', async () => {
    const transactionState = createTransaction([], 1, 0)
    const transaction = vi.fn(async (callback: (tx: any) => Promise<void>) => callback(transactionState.tx))

    await expect(
      createAdapter(transaction).mutateRevision({
        revisionKey: 'locks:revision',
        mutations: [{ type: 'delete', key: 'lock:a', expect: 'present', expectedLockId: 'stale-incarnation' }]
      })
    ).resolves.toBe(false)
    expect(transactionState.tx.update).toHaveBeenCalledOnce()
    expect(transactionState.tx.insert).not.toHaveBeenCalled()
  })

  it('retries a deadlock once', async () => {
    const deadlock = new Error('query failed', { cause: Object.assign(new Error('deadlock'), { code: 'ER_LOCK_DEADLOCK' }) })
    const transaction = vi.fn().mockRejectedValueOnce(deadlock).mockResolvedValueOnce(undefined)
    const adapter = createAdapter(transaction)
    const warn = vi.spyOn((adapter as any).logger, 'warn').mockImplementation(() => undefined)

    await expect(adapter.commitRevision({ revisionKey: 'locks:revision', expectedRevision: null, mutations: [] })).resolves.toBe(true)
    expect(transaction).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalledWith({
      tag: 'commitRevisionMutations',
      msg: 'Retrying locks:revision after a database deadlock'
    })
  })

  it('propagates a deadlock after the single retry is exhausted', async () => {
    const deadlock = new Error('query failed', { cause: Object.assign(new Error('deadlock'), { code: 'ER_LOCK_DEADLOCK' }) })
    const transaction = vi.fn().mockRejectedValue(deadlock)

    await expect(createAdapter(transaction).commitRevision({ revisionKey: 'locks:revision', expectedRevision: null, mutations: [] })).rejects.toBe(
      deadlock
    )
    expect(transaction).toHaveBeenCalledTimes(2)
  })

  it('propagates a lock wait timeout instead of reporting a stale revision', async () => {
    const timeout = new Error('query failed', { cause: Object.assign(new Error('timeout'), { code: 'ER_LOCK_WAIT_TIMEOUT' }) })
    const transaction = vi.fn().mockRejectedValue(timeout)

    await expect(createAdapter(transaction).commitRevision({ revisionKey: 'locks:revision', expectedRevision: null, mutations: [] })).rejects.toBe(
      timeout
    )
    expect(transaction).toHaveBeenCalledOnce()
  })

  it('rejects ambiguous commands before opening a transaction', async () => {
    const transaction = vi.fn()
    const adapter = createAdapter(transaction)
    const command: CacheRevisionCommit = {
      revisionKey: 'locks:revision',
      expectedRevision: null,
      mutations: [
        { type: 'delete', key: 'lock:a', expect: 'present' },
        { type: 'set', key: 'lock:a', value: {}, expect: 'absent' }
      ]
    }

    await expect(adapter.commitRevision(command)).rejects.toThrow('Duplicate cache revision mutation')
    expect(transaction).not.toHaveBeenCalled()
  })

  it('rejects an oversized atomic batch before opening a transaction', async () => {
    const transaction = vi.fn()
    const mutations: CacheRevisionCommit['mutations'] = Array.from({ length: CACHE_REVISION_MAX_MUTATIONS + 1 }, (_, index) => ({
      type: 'delete' as const,
      key: `lock:${index}`,
      expect: 'present' as const
    }))

    await expect(createAdapter(transaction).commitRevision({ revisionKey: 'locks:revision', expectedRevision: null, mutations })).rejects.toThrow(
      `cannot exceed ${CACHE_REVISION_MAX_MUTATIONS} mutations`
    )
    expect(transaction).not.toHaveBeenCalled()
  })

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid mutation TTL %s before opening a transaction', async (ttl) => {
    const transaction = vi.fn()

    await expect(
      createAdapter(transaction).commitRevision({
        revisionKey: 'locks:revision',
        expectedRevision: null,
        mutations: [{ type: 'set', key: 'lock:a', value: {}, ttl, expect: 'absent' }]
      })
    ).rejects.toThrow('Invalid cache revision mutation TTL')
    expect(transaction).not.toHaveBeenCalled()
  })
})
