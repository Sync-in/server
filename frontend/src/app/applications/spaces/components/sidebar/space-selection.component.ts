import { ChangeDetectionStrategy, Component, computed, inject, input, Signal } from '@angular/core'
import { LucideDynamicIcon } from '@lucide/angular'
import { SPACE_ROLE } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective } from 'angular-l10n'
import { BadgeMembersComponent } from '../../../../common/components/badge-members.component'
import { BadgePermissionsComponent } from '../../../../common/components/badge-permissions.component'
import { AutoResizeDirective } from '../../../../common/directives/auto-resize.directive'
import { TimeDateFormatPipe } from '../../../../common/pipes/time-date-format.pipe'
import { defaultCardImageSize, defaultResizeOffset } from '../../../../layout/layout.constants'
import { LayoutService } from '../../../../layout/layout.service'
import { StoreService } from '../../../../store/store.service'
import { SharedChildrenDialogComponent } from '../../../shares/components/dialogs/shared-children-dialog.component'
import { UserAvatarComponent } from '../../../users/components/utils/user-avatar.component'
import { UserService } from '../../../users/user.service'
import { SpaceModel } from '../../models/space.model'
import { SpacesService } from '../../services/spaces.service'
import { SPACES_ICON } from '../../spaces.constants'
import { SpaceUserAnchorsDialogComponent } from '../dialogs/space-user-anchors-dialog.component'

@Component({
  selector: 'app-space-selection',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: 'space-selection.component.html',
  imports: [
    AutoResizeDirective,
    LucideDynamicIcon,
    L10nTranslateDirective,
    TimeDateFormatPipe,
    BadgePermissionsComponent,
    UserAvatarComponent,
    BadgeMembersComponent
  ],
  styles: ['.card {width: 100%; background: transparent; border: none}']
})
export class SpaceSelectionComponent {
  readonly space = input.required<Signal<SpaceModel>>()
  protected readonly selectedSpace = computed(() => this.space()(), { equal: () => false })
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly SPACE_ROLE = SPACE_ROLE
  protected readonly icons = { SPACES: SPACES_ICON.SPACES, ANCHORED: SPACES_ICON.ANCHORED, SHARES: SPACES_ICON.SHARES }
  protected readonly cardImageSize = defaultCardImageSize
  protected readonly resizeOffset = defaultResizeOffset
  private readonly userService = inject(UserService)
  private readonly layout = inject(LayoutService)
  private readonly store = inject(StoreService)
  private readonly spacesService = inject(SpacesService)

  openSpaceRootsDialog() {
    const modalRef = this.layout.openDialog(SpaceUserAnchorsDialogComponent, 'md', {
      initialState: {
        space: this.selectedSpace(),
        user: this.userService.user
      } as SpaceUserAnchorsDialogComponent
    })
    modalRef.content.rootsChange.subscribe((space: SpaceModel) => {
      this.store.spaceSelection.set(space)
      this.spacesService.notifySpaceModelChanged(space)
    })
  }

  openChildShareDialog(space: SpaceModel) {
    if (!space.counts.shares) return
    this.layout.openDialog(SharedChildrenDialogComponent, null, { initialState: { space: space } as SharedChildrenDialogComponent })
  }
}
