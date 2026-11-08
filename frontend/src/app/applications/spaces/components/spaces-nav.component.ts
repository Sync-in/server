import { ChangeDetectionStrategy, Component, computed, inject, OnDestroy, signal } from '@angular/core'
import { RouterOutlet } from '@angular/router'
import { LucideFolderTree, LucideList, LucideMessageSquareMore } from '@lucide/angular'
import { TAB_GROUP, TAB_MENU, TabMenu } from '../../../layout/layout.interfaces'
import { LayoutService } from '../../../layout/layout.service'
import { SelectionComponent } from '../../../layout/sidebar/components/selection.component'
import { StoreService } from '../../../store/store.service'
import { CommentsSelectionComponent } from '../../comments/components/sidebar/comments-selection.component'
import { FilesClipboardComponent } from '../../files/components/sidebar/files-clipboard.component'
import { FilesTreeComponent } from '../../files/components/sidebar/files-tree.component'
import { SPACES_ICON } from '../spaces.constants'

@Component({
  selector: 'app-spaces-nav',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: ` <router-outlet></router-outlet> `
})
export class SpacesNavComponent implements OnDestroy {
  private readonly layout = inject(LayoutService)
  private readonly store = inject(StoreService)
  private readonly tabs: TabMenu[] = [
    { label: TAB_MENU.TREE, components: [FilesTreeComponent], loadComponent: true, icon: LucideFolderTree, title: null, active: false },
    {
      label: TAB_MENU.SELECTION,
      components: [SelectionComponent],
      loadComponent: false,
      icon: SPACES_ICON.SELECTION,
      count: {
        value: computed(() =>
          this.store.filesSelection().length > 1 ? (this.store.filesSelection().length > 100 ? '99+' : this.store.filesSelection().length) : 0
        ),
        level: signal('primary')
      },
      title: null,
      active: false
    },
    {
      label: TAB_MENU.CLIPBOARD,
      components: [FilesClipboardComponent],
      loadComponent: false,
      icon: LucideList,
      count: { value: computed(() => this.store.filesClipboard().length), level: signal('maroon') },
      showOnCount: true,
      title: null,
      active: false
    },
    {
      label: TAB_MENU.COMMENTS,
      components: [CommentsSelectionComponent],
      loadComponent: false,
      icon: LucideMessageSquareMore,
      title: null,
      active: false
    }
  ]

  constructor() {
    this.layout.setTabsRSideBar(TAB_GROUP.FILES, this.tabs)
  }

  ngOnDestroy() {
    this.layout.setTabsRSideBar(null)
  }
}
