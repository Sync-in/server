import { Component, computed, inject, OnDestroy } from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { RouterOutlet } from '@angular/router'
import { LucideFolderTree, LucideList, LucideMessageSquareMore } from '@lucide/angular'
import { map } from 'rxjs/operators'
import { TAB_GROUP, TAB_MENU, TabMenu } from '../../../layout/layout.interfaces'
import { LayoutService } from '../../../layout/layout.service'
import { SelectionComponent } from '../../../layout/sidebar/components/selection.component'
import { StoreService } from '../../../store/store.service'
import { CommentsSelectionComponent } from '../../comments/components/sidebar/comments-selection.component'
import { FilesClipboardComponent } from '../../files/components/sidebar/files-clipboard.component'
import { FilesTreeComponent } from '../../files/components/sidebar/files-tree.component'
import { FileModel } from '../../files/models/file.model'
import { SPACES_ICON } from '../spaces.constants'

@Component({
  selector: 'app-spaces-nav',
  imports: [RouterOutlet],
  template: ` <router-outlet></router-outlet> `
})
export class SpacesNavComponent implements OnDestroy {
  private readonly layout = inject(LayoutService)
  private readonly store = inject(StoreService)
  private tabs: TabMenu[] = [
    { label: TAB_MENU.TREE, components: [FilesTreeComponent], loadComponent: true, icon: LucideFolderTree, title: null, active: false },
    {
      label: TAB_MENU.SELECTION,
      components: [SelectionComponent],
      loadComponent: false,
      icon: SPACES_ICON.SELECTION,
      count: {
        value: toObservable(
          computed(() =>
            this.store.filesSelection().length > 1 ? (this.store.filesSelection().length > 100 ? '99+' : this.store.filesSelection().length) : 0
          )
        ),
        level: 'primary'
      },
      title: null,
      active: false
    },
    {
      label: TAB_MENU.CLIPBOARD,
      components: [FilesClipboardComponent],
      loadComponent: false,
      icon: LucideList,
      count: { value: this.store.filesClipboard.pipe(map((files: FileModel[]) => files.length)), level: 'maroon' },
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
