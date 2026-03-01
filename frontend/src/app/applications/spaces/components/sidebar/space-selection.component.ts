import { ChangeDetectionStrategy, Component, inject, input, InputSignal } from '@angular/core'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { SPACE_ROLE } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective } from 'angular-l10n'
import { BadgePermissionsComponent } from '../../../../common/components/badge-permissions.component'
import { AutoResizeDirective } from '../../../../common/directives/auto-resize.directive'
import { JoinCountsPipe } from '../../../../common/pipes/join-counts.pipe'
import { TimeDateFormatPipe } from '../../../../common/pipes/time-date-format.pipe'
import { defaultCardImageSize, defaultResizeOffset } from '../../../../layout/layout.constants'
import { LayoutService } from '../../../../layout/layout.service'
import { SharedChildrenDialogComponent } from '../../../shares/components/dialogs/shared-children-dialog.component'
import { UserAvatarComponent } from '../../../users/components/utils/user-avatar.component'
import { UserService } from '../../../users/user.service'
import { SpaceModel } from '../../models/space.model'
import { SPACES_ICON } from '../../spaces.constants'
import { SpaceUserAnchorsDialogComponent } from '../dialogs/space-user-anchors-dialog.component'

@Component({
  selector: 'app-space-selection',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: 'space-selection.component.html',
  imports: [
    AutoResizeDirective,
    FaIconComponent,
    L10nTranslateDirective,
    JoinCountsPipe,
    TimeDateFormatPipe,
    BadgePermissionsComponent,
    UserAvatarComponent
  ],
  styles: ['.card {width: 100%; background: transparent; border: none}']
})
export class SpaceSelectionComponent {
  space: InputSignal<SpaceModel> = input.required<SpaceModel>()
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly SPACE_ROLE = SPACE_ROLE
  protected readonly icons = { SPACES: SPACES_ICON.SPACES, ANCHORED: SPACES_ICON.ANCHORED, SHARED: SPACES_ICON.SHARED_WITH_OTHERS }
  protected readonly cardImageSize = defaultCardImageSize
  protected resizeOffset = defaultResizeOffset
  private readonly userService = inject(UserService)
  private readonly layout = inject(LayoutService)

  openSpaceRootsDialog() {
    this.layout.openDialog(SpaceUserAnchorsDialogComponent, 'md', {
      initialState: {
        space: this.space(),
        user: this.userService.user
      } as SpaceUserAnchorsDialogComponent
    })
  }

  openChildShareDialog(space: SpaceModel) {
    if (!space.counts.shares) return
    this.layout.openDialog(SharedChildrenDialogComponent, null, { initialState: { space: space } as SharedChildrenDialogComponent })
  }
}
