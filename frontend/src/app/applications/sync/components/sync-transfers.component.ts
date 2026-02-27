import { KeyValuePipe } from '@angular/common'
import { Component, effect, ElementRef, inject, ViewChild } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { Router } from '@angular/router'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faArrowDown, faArrowUp, faRedo, faTrashCan } from '@fortawesome/free-solid-svg-icons'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { BsModalRef } from 'ngx-bootstrap/modal'
import { TooltipDirective } from 'ngx-bootstrap/tooltip'
import { take } from 'rxjs/operators'
import { FilterComponent } from '../../../common/components/filter.component'
import { VirtualScrollComponent } from '../../../common/components/virtual-scroll.component'
import { TableHeaderConfig } from '../../../common/interfaces/table.interface'
import { originalOrderKeyValue } from '../../../common/utils/functions'
import { SortSettings, SortTable } from '../../../common/utils/sort-table'
import { LayoutService } from '../../../layout/layout.service'
import { StoreService } from '../../../store/store.service'
import { SyncTransfer } from '../interfaces/sync-transfer.interface'
import { SyncPathModel } from '../models/sync-path.model'
import { SyncTransferModel } from '../models/sync-transfer.model'
import { SyncService } from '../services/sync.service'
import { SYNC_ICON, SYNC_PATH, SYNC_TITLE } from '../sync.constants'
import { SyncTransfersDeleteDialogComponent } from './dialogs/sync-transfers-delete.dialog.component'

@Component({
  selector: 'app-sync-transfers',
  imports: [
    FormsModule,
    L10nTranslateDirective,
    L10nTranslatePipe,
    TooltipDirective,
    VirtualScrollComponent,
    FaIconComponent,
    FilterComponent,
    KeyValuePipe
  ],
  templateUrl: 'sync-transfers.component.html'
})
export class SyncTransfersComponent {
  locale = inject<L10nLocale>(L10N_LOCALE)
  @ViewChild(VirtualScrollComponent) scrollView: {
    element: ElementRef
    viewPortItems: SyncTransferModel[]
    scrollInto: (arg: SyncTransferModel | number) => void
  }
  @ViewChild(FilterComponent, { static: true }) inputFilter: FilterComponent
  public action: string = null
  public syncPathSelected: SyncPathModel = null
  public transfers: SyncTransferModel[] = []
  protected readonly store = inject(StoreService)
  // Sort
  protected readonly originalOrderKeyValue = originalOrderKeyValue
  protected tableHeaders: Record<'action' | 'sync' | 'file' | 'date', TableHeaderConfig> = {
    action: {
      label: 'Action',
      width: 8,
      textCenter: false,
      class: '',
      show: true,
      sortable: true
    },
    sync: {
      label: 'Synchronization',
      width: 15,
      textCenter: false,
      class: '',
      show: true,
      sortable: true
    },
    file: {
      label: 'File',
      width: 55,
      textCenter: false,
      class: '',
      show: true,
      sortable: true
    },
    date: {
      label: 'Date',
      width: 20,
      textCenter: true,
      class: '',
      newly: 'newly',
      show: true,
      sortable: true
    }
  }
  protected readonly icons = { faRedo, faTrashCan, faArrowDown, faArrowUp }
  private readonly router = inject(Router)
  private readonly layout = inject(LayoutService)
  private readonly syncService = inject(SyncService)
  private readonly sortSettings: SortSettings = {
    default: [{ prop: 'timestamp', type: 'date' }],
    action: [{ prop: 'actionText', type: 'string' }],
    sync: [{ prop: 'syncPathName', type: 'string' }],
    file: [{ prop: 'file', type: 'string' }],
    date: [{ prop: 'timestamp', type: 'date' }]
  }
  protected sortTable = new SortTable(this.constructor.name, this.sortSettings)
  private focusOnSyncPathErrorsId: number = null
  private search: string = null
  private query: string = null

  constructor() {
    this.layout.setBreadcrumbIcon(SYNC_ICON.TRANSFERS)
    this.layout.setBreadcrumbNav({
      url: `/${SYNC_PATH.BASE}/${SYNC_PATH.TRANSFERS}/${SYNC_TITLE.TRANSFERS}`,
      splicing: 2,
      translating: true,
      sameLink: true
    })
    effect(() => {
      this.doSearch(this.inputFilter.search())
    })
    this.checkRouteState()
    if (this.focusOnSyncPathErrorsId) {
      const syncPath = this.store.clientSyncPaths().find((s) => s.id === this.focusOnSyncPathErrorsId)
      if (syncPath) {
        this.syncPathSelected = syncPath
        this.onSelectAction('ERROR')
      } else {
        this.refresh()
      }
    } else {
      this.refresh()
    }
  }

  doSearch(search: string) {
    this.search = search
    this.doQueryRefresh()
  }

  refresh() {
    this.onSelect()
    this.syncService.getTransfers(this.syncPathSelected?.id, this.query).then((transfers: SyncTransfer[]) => {
      this.transfers = transfers.map((t) => new SyncTransferModel(t))
      this.scrollView?.scrollInto(-1)
    })
  }

  onSelectPath(syncPath: SyncPathModel | null) {
    this.syncPathSelected = syncPath
    this.tableHeaders.sync.show = !this.syncPathSelected
    this.refresh()
  }

  onSelectAction(action: string | null) {
    this.action = action
    this.doQueryRefresh()
  }

  onSelect(t?: SyncTransferModel) {
    for (const t of this.transfers.filter((l: SyncTransferModel) => l.selected)) {
      t.selected = false
    }
    if (t) {
      t.selected = true
    }
  }

  openClearDialog() {
    const modalRef: BsModalRef<SyncTransfersDeleteDialogComponent> = this.layout.openDialog(SyncTransfersDeleteDialogComponent, 'md', {
      initialState: {
        syncPath: this.syncPathSelected || null
      } as SyncTransfersDeleteDialogComponent
    })
    modalRef.content.wasDeleted.pipe(take(1)).subscribe(() => this.refresh())
  }

  sortBy(column: string, toUpdate = true, collection?: SyncTransferModel[]) {
    this.transfers = this.sortTable.sortBy(column, toUpdate, collection || this.transfers)
  }

  private doQueryRefresh() {
    if (this.search && this.action) {
      if (this.action === 'ERROR') {
        this.query = `(?=.*${this.search})(?=.*"ok":"false")`
      } else {
        this.query = `(?=.*${this.search})(?=.*"action":"${this.action}")`
      }
    } else if (this.action) {
      this.query = this.action === 'ERROR' ? '"ok":false' : `"action":"${this.action}"`
    } else if (this.search) {
      this.query = this.search
    } else {
      this.query = null
    }
    this.refresh()
  }

  private checkRouteState() {
    const routeState = this.router.currentNavigation()?.extras.state as { id: number; withSettings: boolean }
    if (routeState?.id) {
      this.focusOnSyncPathErrorsId = routeState.id
    }
  }
}
