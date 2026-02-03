import { inject } from '@angular/core'
import { ResolveFn } from '@angular/router'
import { SyncService } from './services/sync.service'

export const syncPathsResolver: ResolveFn<any> = (): Promise<void> => {
  return inject(SyncService).refreshPaths()
}
