import { Injectable } from '@nestjs/common'
import { AsyncLocalStorage } from 'node:async_hooks'
import type { Observable } from 'rxjs'
import { configuration } from '../../../configuration/config.environment'
import type { ContextStore } from '../interfaces/context-store.interface'

@Injectable()
export class ContextManager {
  private readonly storage: AsyncLocalStorage<ContextStore>

  constructor() {
    this.storage = new AsyncLocalStorage<ContextStore>()
  }

  /**
   * @deprecated Temporary compatibility helper while server.publicUrl is optional.
   * It will be removed in the next major release when server.publicUrl becomes required.
   */
  publicOriginUrl(): string | undefined {
    return configuration.server.publicUrl ?? this.storage.getStore()?.headerOriginUrl
  }

  run(context: ContextStore, cb: () => unknown): Observable<unknown> {
    return this.storage.run(context, cb) as Observable<unknown>
  }
}
