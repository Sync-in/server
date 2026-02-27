import { Component, inject, Input } from '@angular/core'
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
          ? 'badge bg-warning text-failed'
          : 'badge bg-success'
        : 'badge bg-danger'
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
  @Input({ required: true }) s: SyncPathModel
  protected readonly store = inject(StoreService)
  protected readonly SYNC_PATH_SCHEDULER_UNIT = SYNC_PATH_SCHEDULER_UNIT
  protected readonly CLIENT_SCHEDULER_STATE = CLIENT_SCHEDULER_STATE
}
