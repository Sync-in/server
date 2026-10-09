import { toErrorMessage } from '../../common/errors.js'
import { Inject, Logger } from '@nestjs/common'
import { Cache } from './cache.service.js'

export function CacheDecorator(TTL = 120, updateCache: boolean = false) {
  // if updateCache is true, we update the value in the cache on each call
  const injector = Inject(Cache)
  const logger = new Logger(CacheDecorator.name)

  return (target: object, _key: string | symbol, descriptor: PropertyDescriptor): void => {
    injector(target, 'cache')
    const originalMethod = descriptor.value as (...args: unknown[]) => Promise<unknown>

    const memoize = async function (this: { cache: Cache; constructor: { name: string } }, ...args: unknown[]): Promise<unknown> {
      let cacheKey: string | undefined
      try {
        cacheKey = this.cache.genSlugKey(this.constructor.name, originalMethod.name, ...args)
        const cacheResult = await this.cache.get(cacheKey)
        if (cacheResult !== undefined) {
          if (updateCache) {
            originalMethod
              .apply(this, args)
              .then((r: unknown) => {
                this.cache.set(cacheKey!, r, TTL).catch((e: Error) => logger.error({ tag: memoize.name, msg: toErrorMessage(e) }))
              })
              .catch((e: Error) => logger.error({ tag: memoize.name, msg: toErrorMessage(e) }))
          }
          return cacheResult
        }
      } catch (e) {
        logger.error({ tag: memoize.name, msg: toErrorMessage(e) })
      }
      const r = await originalMethod.apply(this, args)
      if (cacheKey !== undefined) {
        this.cache.set(cacheKey, r, TTL).catch((e: Error) => logger.error({ tag: memoize.name, msg: toErrorMessage(e) }))
      }
      return r
    }
    // keep the original function name
    Object.defineProperty(memoize, 'name', {
      value: originalMethod.name,
      writable: false
    })

    // assign memoize function
    descriptor.value = memoize
  }
}
