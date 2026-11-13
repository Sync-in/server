import type { CacheRevisionMutation } from '../../../infrastructure/cache/interfaces/cache-revision.interface.js'

export interface FileLockTransition<T> {
  result: T
  mutations: CacheRevisionMutation[]
}
