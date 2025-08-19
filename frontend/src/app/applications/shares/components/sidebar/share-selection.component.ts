/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { ChangeDetectionStrategy, Component, input, InputSignal, inject } from '@angular/core'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { AutoResizeDirective } from '../../../../common/directives/auto-resize.directive'
import { JoinCountsPipe } from '../../../../common/pipes/join-counts.pipe'
import { TimeDateFormatPipe } from '../../../../common/pipes/time-date-format.pipe'
import { defaultCardImageSize, defaultResizeOffset } from '../../../../layout/layout.constants'
import { TAB_MENU } from '../../../../layout/layout.interfaces'
import { LayoutService } from '../../../../layout/layout.service'
import { SPACES_ICON } from '../../../spaces/spaces.constants'
import { ShareFileModel } from '../../models/share-file.model'
import { SharesService } from '../../services/shares.service'
import { SharedChildrenDialogComponent } from '../dialogs/shared-children-dialog.component'
import { ShareRepositoryComponent } from '../utils/share-repository.component'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-share-selection',
  templateUrl: 'share-selection.component.html',
  imports: [
    AutoResizeDirective,
    L10nTranslateDirective,
    L10nTranslatePipe,
    TimeDateFormatPipe,
    FaIconComponent,
    ShareRepositoryComponent,
    JoinCountsPipe
  ],
  styles: ['.card {width: 100%; background: transparent; border: none}']
})
export class ShareSelectionComponent {
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  private readonly layout = inject(LayoutService)
  private readonly sharesService = inject(SharesService)
  share: InputSignal<ShareFileModel> = input.required<ShareFileModel>()
  protected readonly iconShared = SPACES_ICON.SHARED_WITH_OTHERS
  protected readonly cardImageSize = defaultCardImageSize
  protected readonly resizeOffset = defaultResizeOffset

  childShareDialog(share: ShareFileModel) {
    if (!share.counts.shares) return
    this.layout.openDialog(SharedChildrenDialogComponent, null, { initialState: { share: share } as SharedChildrenDialogComponent })
  }

  goToComments() {
    if (this.share().hasComments) {
      this.sharesService.goTo(this.share()).then(() => this.layout.showRSideBarTab(TAB_MENU.COMMENTS, true))
    }
  }
}
