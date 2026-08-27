import { Component, inject, Input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { LucideBug, LucideCircleAlert, LucideClock, LucideDynamicIcon, LucideGauge, LucideRefreshCw, LucideSquarePen } from '@lucide/angular'
import {
  SYNC_PATH_CONFLICT_MODE,
  SYNC_PATH_DIFF_MODE,
  SYNC_PATH_MODE,
  SYNC_PATH_SCHEDULER_UNIT
} from '@sync-in-server/backend/src/applications/sync/constants/sync'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { TooltipDirective } from 'ngx-bootstrap/tooltip'
import { SyncPathModel } from '../../models/sync-path.model'
import { SYNC_ICON } from '../../sync.constants'
import { SyncPathDirectionIconComponent } from '../utils/sync-path-direction-icon.component'

@Component({
  selector: 'app-sync-path-settings',
  imports: [L10nTranslateDirective, LucideDynamicIcon, FormsModule, TooltipDirective, L10nTranslatePipe, SyncPathDirectionIconComponent],
  templateUrl: './sync-path-settings.component.html',
  styleUrl: './sync-path-settings.component.scss'
})
export class SyncPathSettingsComponent {
  @Input() syncPath: SyncPathModel
  @Input() direction = 'center'
  @Input() showPaths = false
  @Input() size: 'small' | 'large' = 'small'
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected icons = {
    CLIENT: SYNC_ICON.CLIENT,
    SERVER: SYNC_ICON.SERVER,
    LucideCircleAlert,
    LucideGauge,
    LucideClock,
    LucideRefreshCw,
    LucideSquarePen,
    LucideBug
  }
  protected readonly SYNC_PATH_CONFLICT_MODE = SYNC_PATH_CONFLICT_MODE
  protected readonly SYNC_PATH_MODE = SYNC_PATH_MODE
  protected readonly SYNC_PATH_DIFF_MODE = SYNC_PATH_DIFF_MODE
  protected readonly SYNC_PATH_SCHEDULER_UNIT = SYNC_PATH_SCHEDULER_UNIT
}
