import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import {
  LucideBug,
  LucideCircleExclamationPoint,
  LucideClock,
  LucideDynamicIcon,
  LucideGauge,
  LucideRefreshCw,
  LucideSquarePen,
  LucideTrashOff
} from '@lucide/angular'
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
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [L10nTranslateDirective, LucideDynamicIcon, FormsModule, TooltipDirective, L10nTranslatePipe, SyncPathDirectionIconComponent],
  templateUrl: './sync-path-settings.component.html',
  styleUrl: './sync-path-settings.component.scss'
})
export class SyncPathSettingsComponent {
  readonly syncPath = input.required<SyncPathModel>()
  readonly direction = input('center')
  readonly showPaths = input(false)
  readonly size = input<'small' | 'large'>('small')
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly icons = {
    CLIENT: SYNC_ICON.CLIENT,
    SERVER: SYNC_ICON.SERVER,
    LucideCircleExclamationPoint,
    LucideGauge,
    LucideClock,
    LucideRefreshCw,
    LucideSquarePen,
    LucideTrashOff,
    LucideBug
  }
  protected readonly SYNC_PATH_CONFLICT_MODE = SYNC_PATH_CONFLICT_MODE
  protected readonly SYNC_PATH_MODE = SYNC_PATH_MODE
  protected readonly SYNC_PATH_DIFF_MODE = SYNC_PATH_DIFF_MODE
  protected readonly SYNC_PATH_SCHEDULER_UNIT = SYNC_PATH_SCHEDULER_UNIT
}
