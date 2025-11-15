/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Injectable } from '@nestjs/common'
import { AsyncLocalStorage } from 'node:async_hooks'
import type { Observable } from 'rxjs'
import { ContextStore } from '../interfaces/context-store.interface'

@Injectable()
export class ContextManager {
  private readonly storage: AsyncLocalStorage<ContextStore>

  constructor() {
    this.storage = new AsyncLocalStorage<ContextStore>()
  }

  headerOriginUrl(): string {
    return this.storage.getStore() ? this.storage.getStore().headerOriginUrl : undefined
  }

  get(key: keyof ContextStore): any {
    return this.storage.getStore() ? this.storage.getStore()[key] : undefined
  }

  run(context: ContextStore, cb: () => unknown): Observable<unknown> {
    return this.storage.run(context, cb) as Observable<unknown>
  }
}
