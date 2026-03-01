import { ChangeDetectionStrategy, Component, inject, input, InputSignal } from '@angular/core'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { BadgeMembersComponent } from '../../../../common/components/badge-members.component'
import { AutoResizeDirective } from '../../../../common/directives/auto-resize.directive'
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
    BadgeMembersComponent
  ],
  styles: ['.card {width: 100%; background: transparent; border: none}']
})
export class ShareSelectionComponent {
  share: InputSignal<ShareFileModel> = input.required<ShareFileModel>()
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly iconShared = SPACES_ICON.SHARED_WITH_OTHERS
  protected readonly cardImageSize = defaultCardImageSize
  protected readonly resizeOffset = defaultResizeOffset
  private readonly layout = inject(LayoutService)
  private readonly sharesService = inject(SharesService)

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
