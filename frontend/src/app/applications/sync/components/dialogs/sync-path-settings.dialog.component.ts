import { HttpErrorResponse } from '@angular/common/http'
import { Component, EventEmitter, inject, Input, OnInit, Output } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { LucideDynamicIcon, LucideFunnel, LucideRefreshCw, LucideSettings, LucideX } from '@lucide/angular'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { TabDirective, TabHeadingDirective, TabsetComponent } from 'ngx-bootstrap/tabs'
import { SYNC_MAX_PATH_FILTERS } from '@sync-in-server/backend/src/applications/sync/utils/path-filters/constants'
import { validatePathFilterList } from '@sync-in-server/backend/src/applications/sync/utils/path-filters/path-filter-compiler'
import { ELECTRON_DIALOG } from '../../../../electron/constants/dialogs'
import { LayoutService } from '../../../../layout/layout.service'
import { StoreService } from '../../../../store/store.service'
import { SYNC_PATH_FILTER_TYPE } from '../../constants/path'
import { SyncClientModel } from '../../models/sync-client.model'
import { SyncPathModel } from '../../models/sync-path.model'
import { SyncService } from '../../services/sync.service'
import { SyncPathSettingsComponent } from '../shared/sync-path-settings.component'

@Component({
  selector: 'app-sync-path-settings-dialog',
  imports: [
    TabsetComponent,
    L10nTranslatePipe,
    TabDirective,
    SyncPathSettingsComponent,
    FormsModule,
    LucideDynamicIcon,
    L10nTranslateDirective,
    TabHeadingDirective
  ],
  templateUrl: 'sync-path-settings.dialog.component.html',
  styleUrl: 'sync-path-settings.dialog.component.scss'
})
export class SyncPathSettingsDialogComponent implements OnInit {
  @Input({ required: true }) syncPathSelected: SyncPathModel
  @Input() syncClientSelected: SyncClientModel // not needed from client, only for web
  @Output() mustRefresh = new EventEmitter<void>()
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly layout = inject(LayoutService)
  protected readonly store = inject(StoreService)
  protected readonly ELECTRON_DIALOG = ELECTRON_DIALOG
  protected readonly SYNC_MAX_PATH_FILTERS = SYNC_MAX_PATH_FILTERS
  protected readonly SYNC_PATH_FILTER_TYPE = SYNC_PATH_FILTER_TYPE
  protected syncPath: SyncPathModel
  protected currentFilter: string
  protected currentFilterType = this.store.isElectronApp() ? this.SYNC_PATH_FILTER_TYPE.FILE : this.SYNC_PATH_FILTER_TYPE.START
  protected filterTypePlaceholder = {
    [this.SYNC_PATH_FILTER_TYPE.FILE]: 'click on the browse button',
    [this.SYNC_PATH_FILTER_TYPE.FOLDER]: 'click on the browse button',
    [this.SYNC_PATH_FILTER_TYPE.START]: 'with a name or pattern',
    [this.SYNC_PATH_FILTER_TYPE.IN]: 'with a name or pattern',
    [this.SYNC_PATH_FILTER_TYPE.END]: "with the extension ('.mp3', '.avi', '.mov' ...)",
    [this.SYNC_PATH_FILTER_TYPE.EXPERT]: '[-+]?[0-9]*\\.?[0-9]*'
  }
  protected readonly icons = { LucideX, LucideRefreshCw, LucideSettings, LucideFunnel }
  protected confirmDeletion = false
  private invalidFilterIndexes = new Set<number>()
  private filtersValidationPending = true
  private lastValidatedFilter: string | undefined
  private lastValidatedFilterIsInvalid = false
  private readonly syncService = inject(SyncService)

  ngOnInit() {
    this.syncPath = new SyncPathModel(JSON.parse(JSON.stringify(this.syncPathSelected)))
  }

  onSubmit() {
    if (this.confirmDeletion) {
      this.onRemove()
      return
    }
    if (this.store.isElectronApp()) {
      this.syncService.updatePath(this.syncPath.export(true)).then(() => {
        this.syncService.refreshPaths().catch(console.error)
        this.layout.closeDialog()
      })
    } else {
      this.syncService.updateSyncPath(this.syncClientSelected.id, this.syncPath.id, this.syncPath.export()).subscribe({
        next: () => {
          this.mustRefresh.emit()
          this.layout.closeDialog()
        },
        error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Unable to update', this.syncPath.settings.name, e)
      })
    }
  }

  onRemove() {
    if (this.store.isElectronApp()) {
      this.syncService
        .removePath(this.syncPath.id)
        .then(() => {
          this.syncService.refreshPaths().catch(console.error)
          this.layout.closeDialog()
          this.layout.sendNotification('success', 'Sync deleted', this.syncPath.settings.name)
        })
        .catch((e) => this.layout.sendNotification('error', 'Unable to delete', this.syncPath.settings.name, e))
    } else {
      this.syncService.deleteSyncPath(this.syncClientSelected.id, this.syncPath.id).subscribe({
        next: () => {
          this.mustRefresh.emit()
          this.layout.closeDialog()
          this.layout.sendNotification('success', 'Sync deleted', this.syncPath.settings.name)
        },
        error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Unable to delete', this.syncPath.settings.name, e)
      })
    }
  }

  onFlush() {
    this.syncService
      .flushPath(this.syncPath.id)
      .then(() => {
        this.layout.sendNotification('success', 'Sync was reset', this.syncPath.settings.name)
        this.layout.closeDialog()
      })
      .catch((e) => this.layout.sendNotification('error', 'Unable to reset', this.syncPath.settings.name, e))
  }

  onRemoveFilter(index: number) {
    this.syncPath.settings.filters.splice(index, 1)
    this.filtersValidationPending = true
  }

  protected onFilterChange(index: number, filter: string) {
    this.syncPath.settings.filters[index] = filter
    this.filtersValidationPending = true
  }

  onSelect(type: ELECTRON_DIALOG = this.ELECTRON_DIALOG.FILE) {
    this.syncService.showOpenDialog({ properties: [type], defaultPath: this.syncPath.settings.localPath }).then((ev) => {
      if (!ev.canceled) {
        if (ev.filePaths[0].startsWith(this.syncPath.settings.localPath)) {
          this.currentFilter = ev.filePaths[0].replace(this.syncPath.settings.localPath, '').substring(1)
        }
      }
    })
  }

  addFilter() {
    if (this.syncPath.settings.filters.length >= SYNC_MAX_PATH_FILTERS) {
      return
    }

    this.syncPath.settings.filters.unshift(this.buildFilter(this.currentFilter))
    this.currentFilter = null
    this.filtersValidationPending = true
  }

  protected isInvalidFilter(index: number): boolean {
    this.validateFilters()
    return this.invalidFilterIndexes.has(index)
  }

  protected isCurrentFilterInvalid(): boolean {
    if (!this.currentFilter) {
      return false
    }

    const filter = this.buildFilter(this.currentFilter)
    if (filter !== this.lastValidatedFilter) {
      this.lastValidatedFilter = filter
      this.lastValidatedFilterIsInvalid = validatePathFilterList([filter]).length > 0
    }
    return this.lastValidatedFilterIsInvalid
  }

  protected hasInvalidFilters(): boolean {
    this.validateFilters()
    return this.invalidFilterIndexes.size > 0
  }

  onCancel() {
    if (this.confirmDeletion) {
      this.confirmDeletion = false
    } else {
      this.layout.closeDialog()
    }
  }

  private buildFilter(filter: string): string {
    if (this.currentFilterType === this.SYNC_PATH_FILTER_TYPE.START) {
      return `^${filter}.*`
    }
    if (this.currentFilterType === this.SYNC_PATH_FILTER_TYPE.IN) {
      return `.*${filter}.*`
    }
    if (this.currentFilterType === this.SYNC_PATH_FILTER_TYPE.END) {
      return `.*${filter}$`
    }
    return filter
  }

  private validateFilters(): void {
    if (!this.filtersValidationPending || !this.syncPath) {
      return
    }

    this.filtersValidationPending = false
    this.invalidFilterIndexes = new Set(validatePathFilterList(this.syncPath.settings.filters))
  }
}
