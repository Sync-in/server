/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Component, Input, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import {
  faBug,
  faClock,
  faEdit,
  faExclamationCircle,
  faGauge,
  faLongArrowAltDown,
  faLongArrowAltUp,
  faRotate
} from '@fortawesome/free-solid-svg-icons'
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
  imports: [L10nTranslateDirective, FaIconComponent, FormsModule, TooltipDirective, L10nTranslatePipe, SyncPathDirectionIconComponent],
  templateUrl: './sync-path-settings.component.html'
})
export class SyncPathSettingsComponent {
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  @Input() syncPath: SyncPathModel
  @Input() direction = 'center'
  @Input() showPaths = false
  @Input() size: 'small' | 'large' = 'small'
  protected icons = {
    CLIENT: SYNC_ICON.CLIENT,
    SERVER: SYNC_ICON.SERVER,
    faExclamationCircle,
    faLongArrowAltDown,
    faLongArrowAltUp,
    faGauge,
    faClock,
    faRotate,
    faEdit,
    faBug
  }
  protected colSize = { small: [2, 5], large: [3, 6] }
  protected readonly SYNC_PATH_CONFLICT_MODE = SYNC_PATH_CONFLICT_MODE
  protected readonly SYNC_PATH_MODE = SYNC_PATH_MODE
  protected readonly SYNC_PATH_DIFF_MODE = SYNC_PATH_DIFF_MODE
  protected readonly SYNC_PATH_SCHEDULER_UNIT = SYNC_PATH_SCHEDULER_UNIT
}
