import { KeyValuePipe } from '@angular/common'
import { Component, effect, ElementRef, inject, OnDestroy, OnInit, ViewChild } from '@angular/core'
import { Router } from '@angular/router'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import {
  faArrowDown,
  faArrowRotateRight,
  faArrowsSpin,
  faArrowUp,
  faCalendarCheck,
  faCalendarXmark,
  faExclamationTriangle,
  faFlask,
  faForward,
  faInfoCircle,
  faMapMarkerAlt,
  faPencilAlt,
  faPlay,
  faPlus,
  faShuffle,
  faStop
} from '@fortawesome/free-solid-svg-icons'
import { ContextMenuComponent, ContextMenuModule } from '@perfectmemory/ngx-contextmenu'
import { SYNC_PATH_CONFLICT_MODE, SYNC_PATH_MODE } from '@sync-in-server/backend/src/applications/sync/constants/sync'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { BsDropdownDirective, BsDropdownMenuDirective, BsDropdownToggleDirective } from 'ngx-bootstrap/dropdown'
import { TooltipDirective } from 'ngx-bootstrap/tooltip'
import { Subscription } from 'rxjs'
import { FilterComponent } from '../../../common/components/filter.component'
import { VirtualScrollComponent } from '../../../common/components/virtual-scroll.component'
import { AutoResizeDirective } from '../../../common/directives/auto-resize.directive'
import { TableHeaderConfig } from '../../../common/interfaces/table.interface'
import { CapitalizePipe } from '../../../common/pipes/capitalize.pipe'
import { SearchFilterPipe } from '../../../common/pipes/search.pipe'
import { TimeAgoPipe } from '../../../common/pipes/time-ago.pipe'
import { originalOrderKeyValue } from '../../../common/utils/functions'
import { SortSettings, SortTable } from '../../../common/utils/sort-table'
import { LayoutService } from '../../../layout/layout.service'
import { StoreService } from '../../../store/store.service'
import { CLIENT_SCHEDULER_STATE } from '../constants/client'
import { SyncStatus } from '../interfaces/sync-status.interface'
import { SyncTask } from '../interfaces/sync-task.interface'
import { SyncPathModel } from '../models/sync-path.model'
import { SyncService } from '../services/sync.service'
import { SYNC_ICON, SYNC_PATH, SYNC_TITLE } from '../sync.constants'
import { SyncPathReportDialogComponent } from './dialogs/sync-path-report.dialog.component'
import { SyncPathSettingsDialogComponent } from './dialogs/sync-path-settings.dialog.component'
import { SyncPathDirectionIconComponent } from './utils/sync-path-direction-icon.component'
import { SyncPathSchedulerComponent } from './utils/sync-path-scheduler.component'

@Component({
  selector: 'app-sync-paths',
  imports: [
    TooltipDirective,
    L10nTranslatePipe,
    BsDropdownDirective,
    BsDropdownToggleDirective,
    BsDropdownMenuDirective,
    FilterComponent,
    ContextMenuModule,
    SearchFilterPipe,
    SyncPathDirectionIconComponent,
    FaIconComponent,
    TimeAgoPipe,
    KeyValuePipe,
    L10nTranslateDirective,
    SyncPathSchedulerComponent,
    VirtualScrollComponent,
    CapitalizePipe
  ],
  templateUrl: 'sync-paths.component.html'
})
export class SyncPathsComponent implements OnInit, OnDestroy {
  @ViewChild(VirtualScrollComponent) scrollView: {
    element: ElementRef
    viewPortItems: SyncPathModel[]
    scrollInto: (arg: SyncPathModel | number) => void
  }
  @ViewChild(AutoResizeDirective, { static: true }) autoResize: AutoResizeDirective
  @ViewChild(FilterComponent, { static: true }) inputFilter: FilterComponent
  @ViewChild('SyncPathContextMenu', { static: true }) syncPathContextMenu: ContextMenuComponent<any>
  @ViewChild('MainContextMenu', { static: true }) mainContextMenu: ContextMenuComponent<any>
  // data
  public syncsInProgress: SyncStatus[] = []
  public syncPathSelected: SyncPathModel = null
  public allSyncsRunning = false
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly store = inject(StoreService)
  protected readonly originalOrderKeyValue = originalOrderKeyValue
  protected readonly icons = {
    faCalendarXmark,
    faCalendarCheck,
    faArrowDown,
    faArrowUp,
    faArrowRotateRight,
    faPlus,
    faPencilAlt,
    faStop,
    faPlay,
    faForward,
    faArrowsSpin,
    faShuffle,
    faMapMarkerAlt,
    CLIENT: SYNC_ICON.CLIENT,
    SERVER: SYNC_ICON.SERVER,
    faInfoCircle,
    faExclamationTriangle,
    faFlask
  }
  // Sort
  protected tableHeaders: Record<'name' | 'mode' | 'conflictMode' | 'diffMode' | 'scheduler' | 'filters' | 'lastSync', TableHeaderConfig> = {
    name: {
      label: 'Name',
      width: 30,
      textCenter: false,
      class: '',
      show: true,
      sortable: true
    },
    mode: {
      label: 'Direction',
      width: 8,
      textCenter: true,
      class: '',
      show: true,
      sortable: true
    },
    conflictMode: {
      label: 'Conflict',
      width: 6,
      textCenter: true,
      class: 'd-none d-md-table-cell',
      show: true,
      sortable: true
    },
    diffMode: {
      label: 'Mode',
      width: 6,
      textCenter: true,
      class: 'd-none d-md-table-cell',
      show: true,
      sortable: true
    },
    scheduler: {
      label: 'Scheduler',
      width: 8,
      textCenter: true,
      class: '',
      show: true
    },
    filters: {
      label: 'Filters',
      width: 5,
      textCenter: true,
      class: 'd-none d-lg-table-cell',
      show: true,
      sortable: true
    },
    lastSync: {
      label: 'Synced',
      width: 10,
      textCenter: true,
      class: '',
      newly: 'newly',
      show: true,
      sortable: true
    }
  }
  // constants
  protected readonly SYNC_PATH_MODE = SYNC_PATH_MODE
  protected readonly CLIENT_SCHEDULER_STATE = CLIENT_SCHEDULER_STATE
  protected readonly SYNC_PATH_CONFLICT_MODE = SYNC_PATH_CONFLICT_MODE
  private readonly router = inject(Router)
  private readonly layout = inject(LayoutService)
  private readonly syncService = inject(SyncService)
  private readonly sortSettings: SortSettings = {
    default: [{ prop: 'settings.name', type: 'string' }],
    name: [{ prop: 'settings.name', type: 'string' }],
    diffMode: [{ prop: 'settings.diffMode', type: 'string' }],
    conflictMode: [{ prop: 'settings.conflictMode', type: 'string' }],
    mode: [{ prop: 'settings.mode', type: 'string' }],
    filters: [{ prop: 'settings.filters', type: 'length' }],
    lastSync: [{ prop: 'lastSync', type: 'date' }]
  }
  protected sortTable = new SortTable(this.constructor.name, this.sortSettings)
  private subscriptions: Subscription[] = []
  private focusOnPathId: number = null
  private focusOnPathSettings = false

  constructor() {
    this.layout.setBreadcrumbIcon(SYNC_ICON.SYNC)
    this.layout.setBreadcrumbNav({
      url: `/${SYNC_PATH.BASE}/${SYNC_PATH.PATHS}/${SYNC_TITLE.SYNCS}`,
      splicing: 2,
      translating: true,
      sameLink: true
    })
    effect(() => {
      this.onSelect(this.store.clientSyncPaths().find((s) => s.id === this.syncPathSelected?.id))
    })
    this.subscriptions.push(this.store.clientSyncsWithErrors.subscribe((syncs: SyncStatus[]) => this.onSyncErrors(syncs)))
    this.subscriptions.push(this.store.clientSyncs.subscribe((syncs: SyncStatus[]) => this.onSync(syncs)))
    this.subscriptions.push(this.store.clientSyncTask.subscribe((syncTask: SyncTask) => this.onSyncTask(syncTask)))
    this.checkRouteState()
  }

  ngOnInit() {
    if (this.focusOnPathId) {
      const syncPath = this.store.clientSyncPaths().find((s) => s.id === this.focusOnPathId)
      if (syncPath) {
        this.onSelect(syncPath)
        setTimeout(() => this.scrollView.scrollInto(syncPath), 200)
        if (this.focusOnPathSettings) {
          setTimeout(() => this.openSettingsDialog(), 500)
        }
      }
    }
  }

  ngOnDestroy() {
    for (const sub of this.subscriptions) {
      sub.unsubscribe()
    }
  }

  onSelect(syncPath: SyncPathModel = null) {
    this.syncPathSelected = syncPath
  }

  onSync(syncs: SyncStatus[]) {
    this.syncsInProgress = syncs
    for (const syncPath of this.store.clientSyncPaths()) {
      if (this.syncsInProgress.find((s) => s.syncPathId === syncPath.id)) {
        if (!syncPath.inSync) {
          syncPath.setStatus(true)
        }
      } else {
        if (syncPath.inSync) {
          syncPath.settings.lastSync = new Date()
        }
        syncPath.setStatus(false)
      }
    }
    if (this.allSyncsRunning && !this.syncsInProgress.length) {
      this.allSyncsRunning = false
    }
  }

  onSyncErrors(syncs: SyncStatus[]) {
    for (const syncPath of this.store.clientSyncPaths()) {
      const sync = syncs.find((s) => s.syncPathId === syncPath.id)
      const mainError = sync ? sync.mainError : null
      if (syncPath.mainError !== mainError) {
        syncPath.mainError = mainError
        syncPath.setStatus(false)
      }
      syncPath.lastErrors = sync ? sync.lastErrors : []
    }
  }

  onSyncTask(syncTask: SyncTask) {
    const syncPath = this.store.clientSyncPaths().find((s) => s.id === syncTask.syncPathId)
    if (syncPath) {
      syncPath.nbSyncTasks = syncTask.nbTasks
    }
  }

  onRefresh() {
    this.onSelect()
    this.syncService.refreshPaths().catch(console.error)
  }

  doSync(run: boolean) {
    this.syncService.doSync(run, [this.syncPathSelected.id], false)
  }

  doAllSyncs(run: boolean, async = true) {
    let ids: number[] = []
    if (run) {
      this.allSyncsRunning = run
      ids = this.store
        .clientSyncPaths()
        .filter((s: SyncPathModel) => s.settings.enabled && !s.inSync)
        .map((s) => s.id)
    }
    this.syncService.doSync(run, ids, false, async)
  }

  setScheduler(state: CLIENT_SCHEDULER_STATE) {
    if (state !== this.store.clientScheduler()) {
      this.syncService.setClientScheduler(state)
    }
  }

  openReportDialog() {
    this.layout.openDialog(SyncPathReportDialogComponent, 'xl', {
      id: this.syncPathSelected.id,
      initialState: { syncPath: this.syncPathSelected } as SyncPathReportDialogComponent
    })
  }

  openSettingsDialog() {
    this.layout.openDialog(SyncPathSettingsDialogComponent, 'md', {
      initialState: { syncPathSelected: this.syncPathSelected } as SyncPathSettingsDialogComponent
    })
  }

  goToPath(local = true) {
    this.syncService.goToPath(this.syncPathSelected, local)
  }

  addToSync() {
    this.router.navigate([SYNC_PATH.BASE, SYNC_PATH.WIZARD]).catch(console.error)
  }

  sortBy(column: string, toUpdate = true, collection?: SyncPathModel[]) {
    this.store.clientSyncPaths.set(this.sortTable.sortBy(column, toUpdate, collection || this.store.clientSyncPaths()))
  }

  onSyncPathContextMenu(event: any, syncPath: SyncPathModel) {
    event.preventDefault()
    if (event.type === 'contextmenu') {
      event.stopPropagation()
    }
    this.onSelect(syncPath)
    this.layout.openContextMenu(event, this.syncPathContextMenu)
  }

  onContextMenu(event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    this.layout.openContextMenu(event, this.mainContextMenu)
  }

  showErrors(syncPath: SyncPathModel) {
    this.router.navigate([SYNC_PATH.BASE, SYNC_PATH.TRANSFERS], { state: { id: syncPath.id } }).catch(console.error)
  }

  private checkRouteState() {
    const routeState = this.router.currentNavigation()?.extras.state as { id: number; withSettings: boolean }
    if (routeState?.id) {
      this.focusOnPathId = routeState.id
      this.focusOnPathSettings = routeState.withSettings
    }
  }
}
