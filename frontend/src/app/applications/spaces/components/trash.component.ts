import { KeyValuePipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal, viewChild } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { Router } from '@angular/router'
import { LucideArrowDown, LucideArrowUp, LucideDynamicIcon, LucideFolderOpen, LucideRotateCw } from '@lucide/angular'
import { ContextMenuComponent, ContextMenuModule } from '@perfectmemory/ngx-contextmenu'
import { FileTaskStatus } from '@sync-in-server/backend/src/applications/files/models/file-task'
import { SPACE_REPOSITORY } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import type { SpaceTrash } from '@sync-in-server/backend/src/applications/spaces/interfaces/space-trash.interface'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { TooltipModule } from 'ngx-bootstrap/tooltip'
import { debounceTime, filter } from 'rxjs'
import { NavigationViewComponent } from '../../../common/components/navigation-view/navigation-view.component'
import { NavigationViewService } from '../../../common/components/navigation-view/navigation-view.service'
import { VirtualScrollComponent } from '../../../common/components/virtual-scroll.component'
import { TapDirective } from '../../../common/directives/tap.directive'
import { TableHeaderConfig } from '../../../common/interfaces/table.interface'
import { SearchFilterPipe } from '../../../common/pipes/search.pipe'
import { originalOrderKeyValue } from '../../../common/utils/functions'
import { SortSettings, SortTable } from '../../../common/utils/sort-table'
import { LayoutService } from '../../../layout/layout.service'
import { NavbarSearchService } from '../../../layout/navbar/services/navbar-search.service'
import { StoreService } from '../../../store/store.service'
import { FilesTrashEmptyDialogComponent } from '../../files/components/dialogs/files-trash-empty-dialog.component'
import type { FileEvent } from '../../files/interfaces/file-event.interface'
import { TrashModel } from '../models/trash.model'
import { SpacesService } from '../services/spaces.service'
import { SPACES_ICON, SPACES_PATH, SPACES_TITLE } from '../spaces.constants'

@Component({
  selector: 'app-spaces-trash',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LucideDynamicIcon,
    NavigationViewComponent,
    L10nTranslatePipe,
    KeyValuePipe,
    VirtualScrollComponent,
    SearchFilterPipe,
    L10nTranslateDirective,
    ContextMenuModule,
    TooltipModule,
    TapDirective
  ],
  templateUrl: 'trash.component.html'
})
export class TrashComponent implements OnInit {
  protected readonly scrollView = viewChild<VirtualScrollComponent<TrashModel>>(VirtualScrollComponent)
  readonly mainContextMenu = viewChild.required<ContextMenuComponent<any>>('MainContextMenu')
  readonly targetContextMenu = viewChild.required<ContextMenuComponent<any>>('TargetContextMenu')
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly layout = inject(LayoutService)
  protected readonly navbarSearch = inject(NavbarSearchService)
  protected readonly navigationView = inject(NavigationViewService)
  protected readonly originalOrderKeyValue = originalOrderKeyValue
  protected readonly icons = {
    SPACES: SPACES_ICON.SPACES,
    PERSONAL: SPACES_ICON.PERSONAL,
    LucideArrowDown,
    LucideArrowUp,
    LucideFolderOpen,
    LucideRotateCw,
    TRASH: SPACES_ICON.TRASH
  }
  // Sort
  protected tableHeaders: Record<'name' | 'nb' | 'modified', TableHeaderConfig> = {
    name: {
      label: 'Space',
      width: 50,
      textCenter: false,
      class: '',
      show: true,
      sortable: true
    },
    nb: {
      label: 'Elements',
      width: 10,
      textCenter: true,
      class: 'd-none d-md-table-cell',
      show: true,
      sortable: true
    },
    modified: {
      label: 'Modified',
      width: 10,
      textCenter: true,
      class: 'd-none d-lg-table-cell',
      newly: 'newly',
      show: true,
      sortable: true
    }
  }
  private readonly router = inject(Router)
  protected readonly loading = signal(false)
  protected readonly selected = signal<TrashModel>(null)
  protected readonly trashBins = signal<TrashModel[]>([])
  private readonly destroyRef = inject(DestroyRef)
  private readonly store = inject(StoreService)
  private readonly spacesService = inject(SpacesService)
  private readonly sortSettings: SortSettings = {
    default: [
      { prop: 'isPersonal', type: 'number' },
      { prop: 'name', type: 'string' }
    ],
    name: [{ prop: 'name', type: 'string' }],
    nb: [{ prop: 'nb', type: 'number' }],
    modified: [{ prop: 'mtime', type: 'date' }]
  }
  protected sortTable = new SortTable(this.constructor.name, this.sortSettings)

  constructor() {
    this.loadTrashBins()
    this.layout.setBreadcrumbIcon(SPACES_ICON.TRASH)
    this.layout.setBreadcrumbNav({ url: `/${SPACES_PATH.TRASH}/${SPACES_TITLE.TRASH}`, translating: true, sameLink: true })
  }

  ngOnInit() {
    this.store.filesOnEvent
      .pipe(
        filter(
          (event: FileEvent) =>
            event.delete &&
            ((event.filePath === SPACE_REPOSITORY.TRASH && !!event.fileName) ||
              (event.status === FileTaskStatus.SUCCESS &&
                event.filePath?.startsWith(`${SPACE_REPOSITORY.TRASH}/`) &&
                event.filePath.split('/').length === 2))
        ),
        debounceTime(300),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => this.loadTrashBins())
  }

  loadTrashBins() {
    this.loading.set(true)
    this.onSelect()
    this.spacesService.listTrashBins().subscribe({
      next: (trashBins: SpaceTrash[]) => {
        this.sortBy(
          this.sortTable.sortParam.column,
          false,
          trashBins.map((t: SpaceTrash) => new TrashModel(t))
        )
        this.loading.set(false)
      }
    })
  }

  onSelect(trash: TrashModel = null) {
    this.selected.set(trash)
    this.store.trashSelection.set(this.selected())
  }

  sortBy(column: string, toUpdate = true, collection?: TrashModel[]) {
    this.trashBins.set(this.sortTable.sortBy(column, toUpdate, collection || this.trashBins()))
  }

  onContextMenu(ev: MouseEvent) {
    ev.preventDefault()
    ev.stopPropagation()
    this.layout.openContextMenu(ev, this.mainContextMenu())
  }

  onTargetContextMenu(ev: any, trash: TrashModel) {
    ev.preventDefault()
    if (ev.type === 'contextmenu') {
      ev.stopPropagation()
    }
    this.onSelect(trash)
    this.layout.openContextMenu(ev, this.targetContextMenu())
  }

  browse(trash: TrashModel) {
    if (!trash.enabled) {
      this.layout.sendNotification('warning', trash.name, 'Space is disabled')
    } else {
      this.router.navigate([SPACES_PATH.SPACES_TRASH, trash.alias]).catch(console.error)
    }
  }

  onTrashActivate(trash: TrashModel) {
    this.onSelect(trash)
    this.browse(trash)
  }

  openEmptyTrashDialog(trash: TrashModel) {
    if (!trash?.enabled || !trash.nb) return
    this.layout.openDialog(FilesTrashEmptyDialogComponent, null, {
      initialState: {
        trashAlias: trash.alias,
        trashName: trash.isPersonal ? this.layout.translateString(trash.name) : trash.name
      } as FilesTrashEmptyDialogComponent
    })
  }
}
