import { Inject, Logger } from '@nestjs/common'
import { Cache } from './cache.service'

export function CacheDecorator(TTL = 120, updateCache: boolean = false) {
  // if updateCache is true, we update the value in the cache on each call
  const injector = Inject(Cache)
  const logger = new Logger(CacheDecorator.name)

  return (target: any, _key?: string | symbol, descriptor?: TypedPropertyDescriptor<any>) => {
    injector(target, 'cache')
    const originalMethod = descriptor.value

    const memoize = async function (...args: any[]): Promise<any> {
      let cacheKey: string | undefined
      try {
        cacheKey = this.cache.genSlugKey(this.constructor.name, originalMethod.name, ...args)
        const cacheResult = await this.cache.get(cacheKey)
        if (cacheResult !== undefined) {
          if (updateCache) {
            originalMethod
              .apply(this, args)
              .then((r: any) => {
                this.cache.set(cacheKey, r, TTL).catch((e: Error) => logger.error({ tag: memoize.name, msg: `${e}` }))
              })
              .catch((e: Error) => logger.error({ tag: memoize.name, msg: `${e}` }))
          }
          return cacheResult
        }
      } catch (e) {
        logger.error({ tag: memoize.name, msg: `${e}` })
      }
      const r: any = await originalMethod.apply(this, args)
      if (cacheKey !== undefined) {
        this.cache.set(cacheKey, r, TTL).catch((e: Error) => logger.error({ tag: memoize.name, msg: `${e}` }))
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
