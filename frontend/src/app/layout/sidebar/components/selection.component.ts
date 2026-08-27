import { ChangeDetectionStrategy, Component, computed, inject, Signal } from '@angular/core'
import { LucideDynamicIcon, LucideX } from '@lucide/angular'
import { L10nTranslateDirective } from 'angular-l10n'
import { FilesSelectionComponent } from '../../../applications/files/components/sidebar/files-selection.component'
import { FilesService } from '../../../applications/files/services/files.service'
import { LinkSelectionComponent } from '../../../applications/links/components/sidebar/link-selection.component'
import { ShareSelectionComponent } from '../../../applications/shares/components/sidebar/share-selection.component'
import { SpaceSelectionComponent } from '../../../applications/spaces/components/sidebar/space-selection.component'
import { TrashSelectionComponent } from '../../../applications/spaces/components/sidebar/trash-selection.component'
import { SPACES_PATH } from '../../../applications/spaces/spaces.constants'
import { LayoutService } from '../../layout.service'
import { StoreService } from '../../../store/store.service'

@Component({
  selector: 'app-selection',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FilesSelectionComponent,
    ShareSelectionComponent,
    SpaceSelectionComponent,
    TrashSelectionComponent,
    LinkSelectionComponent,
    LucideDynamicIcon,
    L10nTranslateDirective
  ],
  templateUrl: 'selection.component.html'
})
export class SelectionComponent {
  protected readonly store = inject(StoreService)
  private readonly filesService = inject(FilesService)
  private readonly layout = inject(LayoutService)
  protected readonly LucideX = LucideX
  protected readonly SPACES_PATH = SPACES_PATH
  protected readonly selectionType: Signal<(typeof SPACES_PATH)[keyof typeof SPACES_PATH]> = computed(() =>
    this.setRepository(this.store.repository())
  )

  private setRepository(repository: string) {
    if ([SPACES_PATH.SPACES, SPACES_PATH.SHARED, SPACES_PATH.LINKS, SPACES_PATH.TRASHES].indexOf(repository) > -1) {
      return repository
    }
    return SPACES_PATH.FILES
  }

  protected clearSelection() {
    this.layout.toggleRSideBar(false)
    this.filesService.fileSelectionClear.next()
  }
}
