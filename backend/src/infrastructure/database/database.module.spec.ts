import { INFRASTRUCTURE_DEPENDENCY } from '../availability/availability.constants.js'
import { Availability } from '../availability/availability.service.js'
import { DatabaseModule } from './database.module.js'

describe(DatabaseModule.name, () => {
  let connectionListener: (connection: any) => void
  let query: ReturnType<typeof vi.fn>
  let end: ReturnType<typeof vi.fn>
  let availability: Availability
  let databaseModule: DatabaseModule

  const addPoolConnection = (): ((error: unknown) => void) => {
    let errorListener: (error: unknown) => void = () => undefined
    const connection = {
      once: vi.fn((event: string, listener: (error: unknown) => void) => {
        if (event === 'error') errorListener = listener
      }),
      query: vi.fn()
    }
    connectionListener(connection)
    return (error: unknown) => errorListener(error)
  }

  beforeEach(() => {
    query = vi.fn().mockResolvedValue([])
    end = vi.fn().mockResolvedValue(undefined)
    const promisePool = { query, end }
    const pool = {
      on: vi.fn((event: string, listener: typeof connectionListener) => {
        if (event === 'connection') connectionListener = listener
      }),
      promise: vi.fn(() => promisePool)
    }
    availability = new Availability()
    databaseModule = new DatabaseModule({ $client: pool } as any, availability)
    vi.spyOn(databaseModule['logger'], 'error').mockImplementation(() => undefined)
    vi.spyOn(databaseModule['logger'], 'log').mockImplementation(() => undefined)
    vi.spyOn(databaseModule['logger'], 'warn').mockImplementation(() => undefined)
  })

  afterEach(async () => {
    await databaseModule.beforeApplicationShutdown()
  })

  it('does not poll MySQL after the initial connection succeeds', async () => {
    const waitRetryDelay = vi.spyOn(databaseModule as any, 'waitRetryDelay').mockResolvedValue(false)

    await databaseModule.onModuleInit()

    expect(query).toHaveBeenCalledOnce()
    expect(query).toHaveBeenCalledWith('SELECT 1')
    expect(waitRetryDelay).not.toHaveBeenCalled()
    expect(availability.isAvailable(INFRASTRUCTURE_DEPENDENCY.DATABASE)).toBe(true)
  })

  it('starts only one immediate recovery when pooled connections report errors', async () => {
    await databaseModule.onModuleInit()
    const firstConnectionError = addPoolConnection()
    const secondConnectionError = addPoolConnection()
    let resolveRecovery: (value: unknown) => void = () => undefined
    query.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRecovery = resolve
        })
    )
    const connectionError = Object.assign(new Error('Connection lost'), { code: 'ECONNRESET' })

    firstConnectionError(connectionError)
    const recoveryPromise = databaseModule['recoveryPromise']
    secondConnectionError(connectionError)

    expect(availability.isAvailable(INFRASTRUCTURE_DEPENDENCY.DATABASE)).toBe(false)
    expect(query).toHaveBeenCalledTimes(2)
    expect(databaseModule['recoveryPromise']).toBe(recoveryPromise)

    resolveRecovery([])
    await recoveryPromise

    expect(availability.isAvailable(INFRASTRUCTURE_DEPENDENCY.DATABASE)).toBe(true)
    expect(databaseModule['recoveryPromise']).toBeUndefined()
  })

  it('retries a recoverable connection failure and stops after the first success', async () => {
    await databaseModule.onModuleInit()
    const connectionError = addPoolConnection()
    const retryableError = Object.assign(new Error('Connection refused'), { code: 'ECONNREFUSED' })
    query.mockRejectedValueOnce(retryableError).mockResolvedValueOnce([])
    const waitRetryDelay = vi.spyOn(databaseModule as any, 'waitRetryDelay').mockResolvedValue(true)

    connectionError(retryableError)
    await databaseModule['recoveryPromise']

    expect(query).toHaveBeenCalledTimes(3)
    expect(waitRetryDelay).toHaveBeenCalledOnce()
    expect(availability.isAvailable(INFRASTRUCTURE_DEPENDENCY.DATABASE)).toBe(true)
    expect(databaseModule['recoveryPromise']).toBeUndefined()
  })

  it('does not restore availability when an in-flight recovery finishes during shutdown', async () => {
    await databaseModule.onModuleInit()
    const connectionError = addPoolConnection()
    let resolveRecovery: (value: unknown) => void = () => undefined
    query.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRecovery = resolve
        })
    )

    connectionError(Object.assign(new Error('Connection lost'), { code: 'ECONNRESET' }))
    const shutdownPromise = databaseModule.beforeApplicationShutdown()

    expect(end).not.toHaveBeenCalled()
    resolveRecovery([])
    await shutdownPromise

    expect(availability.isAvailable(INFRASTRUCTURE_DEPENDENCY.DATABASE)).toBe(false)
    expect(end).toHaveBeenCalledOnce()
  })
})
