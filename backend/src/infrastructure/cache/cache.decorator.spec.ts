import 'reflect-metadata'
import { Logger } from '@nestjs/common'
import { CacheDecorator } from './cache.decorator'
import { Cache } from './cache.service'

interface CacheMock {
  genSlugKey: ReturnType<typeof vi.fn>
  get: ReturnType<typeof vi.fn>
  set: ReturnType<typeof vi.fn>
}

class CachedService {
  readonly original = vi.fn(async (left: number, right: number) => left + right)

  constructor(readonly cache: Cache) {}

  @CacheDecorator(60)
  async compute(left: number, right: number): Promise<number> {
    return this.original(left, right)
  }
}

class RefreshingCachedService {
  readonly original = vi.fn(async (value: number) => value * 2)

  constructor(readonly cache: Cache) {}

  @CacheDecorator(90, true)
  async compute(value: number): Promise<number> {
    return this.original(value)
  }
}

describe(CacheDecorator.name, () => {
  let cache: CacheMock

  beforeEach(() => {
    cache = {
      genSlugKey: vi.fn(() => 'cache-key'),
      get: vi.fn(),
      set: vi.fn().mockResolvedValue(true)
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return a cached value without calling the original method', async () => {
    cache.get.mockResolvedValue(42)
    const service = new CachedService(cache as unknown as Cache)

    await expect(service.compute(1, 2)).resolves.toBe(42)

    expect(cache.genSlugKey).toHaveBeenCalledWith(CachedService.name, 'compute', 1, 2)
    expect(service.original).not.toHaveBeenCalled()
    expect(cache.set).not.toHaveBeenCalled()
  })

  it('should call the original method and cache its result on a cache miss', async () => {
    cache.get.mockResolvedValue(undefined)
    const service = new CachedService(cache as unknown as Cache)

    await expect(service.compute(2, 3)).resolves.toBe(5)

    expect(service.original).toHaveBeenCalledOnce()
    expect(service.original).toHaveBeenCalledWith(2, 3)
    expect(cache.set).toHaveBeenCalledWith('cache-key', 5, 60)
  })

  it('should preserve the context and arguments when reading from the cache fails', async () => {
    const cacheError = new Error('cache read failed')
    const loggerError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    cache.get.mockRejectedValue(cacheError)
    const service = new CachedService(cache as unknown as Cache)

    await expect(service.compute(4, 5)).resolves.toBe(9)

    expect(loggerError).toHaveBeenCalledWith({ tag: 'compute', msg: `${cacheError}` })
    expect(service.original).toHaveBeenCalledOnce()
    expect(service.original).toHaveBeenCalledWith(4, 5)
    expect(cache.set).toHaveBeenCalledWith('cache-key', 9, 60)
  })

  it('should propagate an original method error without retrying it', async () => {
    const methodError = new Error('method failed')
    cache.get.mockResolvedValue(undefined)
    const service = new CachedService(cache as unknown as Cache)
    service.original.mockRejectedValue(methodError)

    await expect(service.compute(6, 7)).rejects.toBe(methodError)

    expect(service.original).toHaveBeenCalledOnce()
    expect(service.original).toHaveBeenCalledWith(6, 7)
    expect(cache.set).not.toHaveBeenCalled()
  })

  it('should log a cache write error without altering the original result', async () => {
    const cacheError = new Error('cache write failed')
    const loggerError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    cache.get.mockResolvedValue(undefined)
    cache.set.mockRejectedValue(cacheError)
    const service = new CachedService(cache as unknown as Cache)

    await expect(service.compute(2, 3)).resolves.toBe(5)

    expect(service.original).toHaveBeenCalledOnce()
    await vi.waitFor(() => {
      expect(loggerError).toHaveBeenCalledWith({ tag: 'compute', msg: `${cacheError}` })
    })
  })

  it('should return the cached value and refresh it in the background', async () => {
    cache.get.mockResolvedValue(10)
    const service = new RefreshingCachedService(cache as unknown as Cache)

    await expect(service.compute(8)).resolves.toBe(10)

    await vi.waitFor(() => {
      expect(service.original).toHaveBeenCalledOnce()
      expect(cache.set).toHaveBeenCalledWith('cache-key', 16, 90)
    })
  })

  it('should log a background refresh error while returning the cached value', async () => {
    const refreshError = new Error('refresh failed')
    const loggerError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    cache.get.mockResolvedValue(10)
    const service = new RefreshingCachedService(cache as unknown as Cache)
    service.original.mockRejectedValue(refreshError)

    await expect(service.compute(8)).resolves.toBe(10)

    await vi.waitFor(() => {
      expect(loggerError).toHaveBeenCalledWith({ tag: 'compute', msg: `${refreshError}` })
    })
    expect(cache.set).not.toHaveBeenCalled()
  })
})
