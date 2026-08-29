import { KeyValuePipe, NgTemplateOutlet } from '@angular/common'
import { HttpErrorResponse } from '@angular/common/http'
import { Component, ElementRef, inject, OnInit, ViewChild } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import {
  LucideArrowDown,
  LucideArrowUp,
  LucideCirclePlus,
  LucideDynamicIcon,
  LucideMapPin,
  LucideMessageSquareMore,
  LucideRotateCw,
  LucideStarOff,
  LucideTriangleAlert
} from '@lucide/angular'
import { ContextMenuComponent, ContextMenuModule } from '@perfectmemory/ngx-contextmenu'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { TooltipModule } from 'ngx-bootstrap/tooltip'
import { take } from 'rxjs/operators'
import { FilterComponent } from '../../../common/components/filter.component'
import { NavigationViewComponent, ViewMode } from '../../../common/components/navigation-view/navigation-view.component'
import { VirtualScrollComponent } from '../../../common/components/virtual-scroll.component'
import { TapDirective } from '../../../common/directives/tap.directive'
import { TableHeaderConfig } from '../../../common/interfaces/table.interface'
import { SearchFilterPipe } from '../../../common/pipes/search.pipe'
import { LiveTimeAgoPipe } from '../../../common/pipes/time-ago-live.pipe'
import { ToBytesPipe } from '../../../common/pipes/to-bytes.pipe'
import { originalOrderKeyValue } from '../../../common/utils/functions'
import { SortSettings, SortTable } from '../../../common/utils/sort-table'
import { TAB_MENU } from '../../../layout/layout.interfaces'
import { LayoutService } from '../../../layout/layout.service'
import { FileLocationComponent } from '../../files/components/utils/file-location.component'
import { FileFavoriteModel } from '../../files/models/file-favorite.model'
import { FilesService } from '../../files/services/files.service'
import { SPACES_ICON, SPACES_PATH } from '../../spaces/spaces.constants'
import { SYNC_ICON } from '../../sync/sync.constants'
import { FAVORITES_ICON, FAVORITES_PATH, FAVORITES_TITLE } from '../favorites.constants'

@Component({
  selector: 'app-favorites',
  imports: [
    LucideDynamicIcon,
    KeyValuePipe,
    NgTemplateOutlet,
    L10nTranslateDirective,
    L10nTranslatePipe,
    NavigationViewComponent,
    FilterComponent,
    SearchFilterPipe,
    TooltipModule,
    VirtualScrollComponent,
    ContextMenuModule,
    TapDirective,
    LiveTimeAgoPipe,
    ToBytesPipe,
    FileLocationComponent
  ],
  templateUrl: './favorites.component.html'
})
export class FavoritesComponent implements OnInit {
  @ViewChild(VirtualScrollComponent) scrollView: {
    element: ElementRef
    viewPortItems: FileFavoriteModel[]
    scrollInto: (arg: FileFavoriteModel | number) => void
  }
  @ViewChild(FilterComponent, { static: true }) inputFilter: FilterComponent
  @ViewChild(NavigationViewComponent, { static: true }) btnNavigationView: NavigationViewComponent
  @ViewChild('MainContextMenu', { static: true }) mainContextMenu: ContextMenuComponent<any>
  @ViewChild('TargetContextMenu', { static: true }) targetContextMenu: ContextMenuComponent<any>
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly layout = inject(LayoutService)
  protected readonly icons = {
    FAVORITES: FAVORITES_ICON,
    SHARED: SPACES_ICON.SHARED_WITH_OTHERS,
    SPACES: SPACES_ICON.SPACES,
    LINKS: SPACES_ICON.LINKS,
    SYNC: SYNC_ICON.SYNC,
    LucideRotateCw,
    LucideArrowDown,
    LucideArrowUp,
    LucideCirclePlus,
    LucideMapPin,
    LucideMessageSquareMore,
    LucideTriangleAlert,
    REMOVE_FAVORITE: LucideStarOff
  }
  protected readonly originalOrderKeyValue = originalOrderKeyValue
  protected readonly TAB_MENU = TAB_MENU
  protected loading = false
  protected galleryMode: ViewMode
  protected favorites: FileFavoriteModel[] = []
  protected selected: FileFavoriteModel = null
  protected tableHeaders: Record<'name' | 'location' | 'info' | 'size' | 'modified' | 'created', TableHeaderConfig> = {
    name: {
      label: 'Name',
      width: 30,
      textCenter: false,
      class: '',
      show: true,
      sortable: true
    },
    location: {
      label: 'Location',
      width: 25,
      textCenter: false,
      class: 'd-none d-md-table-cell fs-sm',
      show: true,
      sortable: true
    },
    info: { label: 'Info', width: 15, textCenter: true, class: 'd-none d-md-table-cell', show: true },
    size: {
      label: 'Size',
      width: 10,
      textCenter: true,
      class: 'd-none d-lg-table-cell',
      show: true,
      sortable: true
    },
    modified: {
      label: 'Modified',
      width: 10,
      textCenter: true,
      class: 'd-none d-sm-table-cell',
      newly: 'newly',
      show: true,
      sortable: true
    },
    created: {
      label: 'Added',
      width: 10,
      textCenter: true,
      class: 'd-none d-lg-table-cell',
      show: true,
      sortable: true
    }
  }
  private readonly activatedRoute = inject(ActivatedRoute)
  private readonly router = inject(Router)
  private readonly filesService = inject(FilesService)
  private focusOnSelect: string
  private readonly sortSettings: SortSettings = {
    default: [{ prop: 'createdAt', type: 'date' }],
    name: [{ prop: 'name', type: 'string' }],
    location: [{ prop: 'showedPath', type: 'string' }],
    size: [{ prop: 'size', type: 'number' }],
    modified: [{ prop: 'mtime', type: 'number' }],
    created: [{ prop: 'createdAt', type: 'date' }]
  }
  protected sortTable = new SortTable(this.constructor.name, this.sortSettings)

  constructor() {
    this.activatedRoute.queryParams.subscribe((params) => (this.focusOnSelect = params.select))
    this.layout.setBreadcrumbIcon(FAVORITES_ICON)
    this.layout.setBreadcrumbNav({ url: `/${FAVORITES_PATH.BASE}/${FAVORITES_TITLE}`, translating: true, sameLink: true })
  }

  ngOnInit() {
    this.galleryMode = this.btnNavigationView.currentView()
    this.loadFavorites()
  }

  loadFavorites() {
    this.loading = true
    this.onSelect()
    this.inputFilter.clear()
    this.filesService
      .listFavorites()
      .pipe(take(1))
      .subscribe({
        next: (favorites: FileFavoriteModel[]) => {
          this.sortBy(this.sortTable.sortParam.column, false, [...favorites])
          this.loading = false
          if (this.focusOnSelect) {
            this.focusOn(this.focusOnSelect)
          } else {
            this.scrollView?.scrollInto(-1)
          }
        },
        error: (e: HttpErrorResponse) => {
          this.favorites = []
          this.loading = false
          this.layout.sendNotification('error', 'Favorites', 'Unable to load', e)
        }
      })
  }

  sortBy(column: string, toUpdate = true, collection?: FileFavoriteModel[]) {
    this.favorites = this.sortTable.sortBy(column, toUpdate, collection || this.favorites)
  }

  onSelect(favorite: FileFavoriteModel = null) {
    this.selected = favorite
  }

  onContextMenu(ev: Event) {
    ev.preventDefault()
    ev.stopPropagation()
    this.layout.openContextMenu(ev, this.mainContextMenu)
  }

  onTargetContextMenu(ev: Event, favorite: FileFavoriteModel) {
    ev.preventDefault()
    if (ev.type === 'contextmenu') {
      ev.stopPropagation()
    }
    this.onSelect(favorite)
    this.layout.openContextMenu(ev, this.targetContextMenu)
  }

  goTo(favorite: FileFavoriteModel = this.selected, tab?: TAB_MENU) {
    if (!favorite) return
    if (favorite.isDisabled) {
      this.layout.sendNotification('warning', favorite.name, 'No longer accessible')
      return
    }
    this.router
      .navigate([SPACES_PATH.SPACES, ...favorite.path.split('/')], { queryParams: { select: favorite.name } })
      .then((navigated) => {
        if (navigated && tab) this.layout.showRSideBarTab(tab, true)
      })
      .catch(console.error)
  }

  goToDetails(ev: Event, favorite: FileFavoriteModel, tab: TAB_MENU) {
    ev.stopPropagation()
    this.goTo(favorite, tab)
  }

  removeFavorite(favorite: FileFavoriteModel = this.selected, ev?: Event) {
    ev?.stopPropagation()
    if (!favorite) return
    this.filesService
      .removeFavorite(favorite.fileId)
      .pipe(take(1))
      .subscribe({
        next: () => {
          if (this.selected?.fileId === favorite.fileId) this.onSelect()
          this.sortBy(
            this.sortTable.sortParam.column,
            false,
            this.favorites.filter((item) => item.fileId !== favorite.fileId)
          )
        },
        error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Favorites', favorite.name, e)
      })
  }

  private focusOn(select: string) {
    const favorite = this.favorites.find((item) => item.name.toLowerCase() === select.toLowerCase())
    if (favorite) {
      setTimeout(() => this.scrollView?.scrollInto(favorite), 100)
      this.onSelect(favorite)
    }
  }
}
