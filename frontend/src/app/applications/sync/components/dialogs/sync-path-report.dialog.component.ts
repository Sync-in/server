import { KeyValuePipe } from '@angular/common'
import { Component, inject, Input, OnDestroy, OnInit, signal, ViewChild, WritableSignal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faArrowDown, faArrowUp, faFilter, faFlask, faMapMarkerAlt, faRotate, faSpinner, faStop } from '@fortawesome/free-solid-svg-icons'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { ButtonCheckboxDirective } from 'ngx-bootstrap/buttons'
import { BsDropdownDirective, BsDropdownMenuDirective, BsDropdownToggleDirective } from 'ngx-bootstrap/dropdown'
import { PaginationComponent } from 'ngx-bootstrap/pagination'
import { TooltipDirective } from 'ngx-bootstrap/tooltip'
import { Subscription } from 'rxjs'
import { FilterComponent } from '../../../../common/components/filter.component'
import { AutoResizeDirective } from '../../../../common/directives/auto-resize.directive'
import { TableHeaderConfig } from '../../../../common/interfaces/table.interface'
import { PaginatePipe } from '../../../../common/pipes/paginate.pipe'
import { SearchFilterPipe } from '../../../../common/pipes/search.pipe'
import { originalOrderKeyValue } from '../../../../common/utils/functions'
import { SortSettings, SortTable } from '../../../../common/utils/sort-table'
import { EVENT } from '../../../../electron/constants/events'
import { Electron } from '../../../../electron/electron.service'
import { LayoutService } from '../../../../layout/layout.service'
import { StoreService } from '../../../../store/store.service'
import { SYNC_TRANSFER_ACTION } from '../../constants/transfer'
import { SyncTransfer } from '../../interfaces/sync-transfer.interface'
import { SyncPathModel } from '../../models/sync-path.model'
import { SyncTransferModel } from '../../models/sync-transfer.model'
import { SyncService } from '../../services/sync.service'
import { SYNC_ICON } from '../../sync.constants'

@Component({
  selector: 'app-sync-folder-report-dialog',
  imports: [
    FaIconComponent,
    L10nTranslateDirective,
    L10nTranslatePipe,
    TooltipDirective,
    BsDropdownDirective,
    BsDropdownToggleDirective,
    BsDropdownMenuDirective,
    AutoResizeDirective,
    PaginationComponent,
    FormsModule,
    FilterComponent,
    KeyValuePipe,
    PaginatePipe,
    SearchFilterPipe,
    ButtonCheckboxDirective
  ],
  templateUrl: 'sync-path-report.dialog.component.html',
  styleUrl: './sync-path-report.dialog.component.scss'
})
export class SyncPathReportDialogComponent implements OnInit, OnDestroy {
  locale = inject<L10nLocale>(L10N_LOCALE)
  @ViewChild(AutoResizeDirective, { static: true }) autoResizeDirective: AutoResizeDirective
  @ViewChild(FilterComponent, { static: true }) inputFilter: FilterComponent
  @Input() syncPath: SyncPathModel
  protected readonly originalOrderKeyValue = originalOrderKeyValue
  protected readonly SYNC_TRANSFER_ACTION = SYNC_TRANSFER_ACTION
  protected readonly icons = {
    faArrowDown,
    faArrowUp,
    faStop,
    faFlask,
    faSpinner,
    faRotate,
    faMapMarkerAlt,
    faFilter,
    CLIENT: SYNC_ICON.CLIENT,
    SERVER: SYNC_ICON.SERVER
  }
  // Sort
  protected tableHeaders: Record<'action' | 'file', TableHeaderConfig> = {
    action: {
      label: 'Action',
      width: 20,
      textCenter: false,
      class: '',
      show: true,
      sortable: true
    },
    file: {
      label: 'File',
      width: 80,
      textCenter: false,
      class: '',
      show: true,
      sortable: true
    }
  }
  protected readonly itemsPerPage = 500
  protected currentPage = 1
  protected running = false
  protected hasNoChanges = false
  protected transferSelected = null
  protected showFiltered = false
  protected count = { actions: 0, filtered: 0 }
  protected transfers: WritableSignal<SyncTransferModel[]> = signal([])
  private readonly layout = inject(LayoutService)
  private readonly electron = inject(Electron)
  private readonly store = inject(StoreService)
  private readonly syncService = inject(SyncService)
  private readonly sortSettings: SortSettings = {
    default: [{ prop: 'nbTasks', type: 'number' }],
    action: [{ prop: 'actionText', type: 'string' }],
    file: [{ prop: 'file', type: 'string' }]
  }
  protected sortTable = new SortTable(this.constructor.name, this.sortSettings)
  private subscriptions: Subscription[] = []

  ngOnInit() {
    this.electron.ipcRenderer.on(EVENT.SYNC.REPORT_TRANSFER, (_ev, tr: SyncTransfer) => this.addTransfer(tr))
    this.subscriptions.push(this.store.clientSyncIsReporting.subscribe((state: boolean) => this.manageState(state)))
  }

  ngOnDestroy() {
    for (const sub of this.subscriptions) {
      sub.unsubscribe()
    }
    this.electron.ipcRenderer.removeAllListeners(EVENT.SYNC.REPORT_TRANSFER)
  }

  manageReport(start = false) {
    if (start) {
      this.hasNoChanges = false
      this.count = { actions: 0, filtered: 0 }
      this.transfers.set([])
    }
    this.syncService.doSync(start, [this.syncPath.id], true)
  }

  sortBy(column: string, toUpdate = true, collection?: SyncTransferModel[]) {
    this.transfers.set(this.sortTable.sortBy(column, toUpdate, collection || this.transfers()))
  }

  onSelect(tr?: SyncTransferModel) {
    this.transferSelected = tr || null
  }

  goToPath(local = true) {
    this.syncService.goToPath(this.syncPath, local, this.transferSelected.file)
  }

  pageChanged() {
    this.onSelect()
    this.autoResizeDirective.scrollTop()
  }

  onClose() {
    if (this.running) {
      this.syncService.doSync(false, [this.syncPath.id], true)
    }
    this.layout.closeDialog(null, this.syncPath.id)
  }

  onMinimize() {
    this.layout.minimizeDialog(this.syncPath.id, { name: this.syncPath.settings.name, mimeUrl: this.syncPath.mimeUrl })
  }

  private addTransfer(tr: SyncTransfer) {
    const s = new SyncTransferModel(tr)
    if (s.isFiltered) {
      this.count.filtered++
    } else {
      this.count.actions++
    }
    this.transfers.update((transfers: SyncTransferModel[]) => [...transfers, s])
  }

  private manageState(state: boolean) {
    if (this.running && state === false && this.transfers().length === 0) {
      this.hasNoChanges = true
    }
    this.running = state
  }
}
