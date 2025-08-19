/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Component, Input, inject } from '@angular/core'
import { SYNC_PATH_SCHEDULER_UNIT } from '@sync-in-server/backend/src/applications/sync/constants/sync'
import { L10nTranslateDirective } from 'angular-l10n'
import { StoreService } from '../../../../store/store.service'
import { CLIENT_SCHEDULER_STATE } from '../../constants/client'
import { SyncPathModel } from '../../models/sync-path.model'

@Component({
  selector: 'app-sync-path-scheduler',
  imports: [L10nTranslateDirective],
  template: `<span
    class="{{
      s.settings.scheduler.unit !== SYNC_PATH_SCHEDULER_UNIT.DISABLED
        ? store.clientScheduler() === CLIENT_SCHEDULER_STATE.DISABLED
          ? 'text-warning text-failed'
          : 'text-success'
        : 'text-danger'
    }}"
  >
    @if (s.settings.scheduler.unit === SYNC_PATH_SCHEDULER_UNIT.DISABLED) {
      <span l10nTranslate>{{ s.settings.scheduler.unit }}</span>
    } @else {
      <span>
        <span>{{ s.settings.scheduler.value }}&nbsp;</span>
        <span l10nTranslate>{{ s.settings.scheduler.unit + 's' }}</span>
      </span>
    }
  </span>`
})
export class SyncPathSchedulerComponent {
  protected readonly store = inject(StoreService)
  @Input({ required: true }) s: SyncPathModel
  protected readonly SYNC_PATH_SCHEDULER_UNIT = SYNC_PATH_SCHEDULER_UNIT
  protected readonly CLIENT_SCHEDULER_STATE = CLIENT_SCHEDULER_STATE
}
