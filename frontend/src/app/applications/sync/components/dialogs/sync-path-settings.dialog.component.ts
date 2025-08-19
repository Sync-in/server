/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */
import { HttpErrorResponse } from '@angular/common/http'
import { Component, EventEmitter, inject, Input, OnInit, Output } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faRotate, faTimes } from '@fortawesome/free-solid-svg-icons'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { TabDirective, TabsetComponent } from 'ngx-bootstrap/tabs'
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
  imports: [TabsetComponent, L10nTranslatePipe, TabDirective, SyncPathSettingsComponent, FormsModule, FaIconComponent, L10nTranslateDirective],
  templateUrl: 'sync-path-settings.dialog.component.html'
})
export class SyncPathSettingsDialogComponent implements OnInit {
  @Input({ required: true }) syncPathSelected: SyncPathModel
  @Input() syncClientSelected: SyncClientModel // not needed from client, only for web
  @Output() mustRefresh = new EventEmitter<void>()
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly layout = inject(LayoutService)
  protected readonly store = inject(StoreService)
  protected readonly ELECTRON_DIALOG = ELECTRON_DIALOG
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
  protected readonly icons = { faTimes, faRotate }
  protected confirmDeletion = false
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
    if (
      this.currentFilterType === this.SYNC_PATH_FILTER_TYPE.FILE ||
      this.currentFilterType === this.SYNC_PATH_FILTER_TYPE.FOLDER ||
      this.currentFilterType === this.SYNC_PATH_FILTER_TYPE.EXPERT
    ) {
      this.syncPath.settings.filters.unshift(this.currentFilter)
    } else if (this.currentFilterType === this.SYNC_PATH_FILTER_TYPE.START) {
      this.syncPath.settings.filters.unshift(`^${this.currentFilter}.*`)
    } else if (this.currentFilterType === this.SYNC_PATH_FILTER_TYPE.IN) {
      this.syncPath.settings.filters.unshift(`.*${this.currentFilter}.*`)
    } else if (this.currentFilterType === this.SYNC_PATH_FILTER_TYPE.END) {
      this.syncPath.settings.filters.unshift(`.*${this.currentFilter}$`)
    }
    this.currentFilter = null
  }

  onCancel() {
    if (this.confirmDeletion) {
      this.confirmDeletion = false
    } else {
      this.layout.closeDialog()
    }
  }
}
