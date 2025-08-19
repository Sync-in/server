/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Component, EventEmitter, inject, Input, Output } from '@angular/core'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faTrashCan } from '@fortawesome/free-solid-svg-icons'
import { L10nTranslateDirective } from 'angular-l10n'
import { LayoutService } from '../../../../layout/layout.service'
import { SyncPathModel } from '../../models/sync-path.model'
import { SyncService } from '../../services/sync.service'

@Component({
  selector: 'app-sync-transfers-delete-dialog',
  imports: [L10nTranslateDirective, FaIconComponent],
  templateUrl: './sync-transfers-delete.dialog.component.html'
})
export class SyncTransfersDeleteDialogComponent {
  @Input() syncPath: SyncPathModel = null
  @Output() wasDeleted = new EventEmitter<void>()
  protected readonly layout = inject(LayoutService)
  protected readonly icons = { faTrashCan }
  private readonly syncService = inject(SyncService)

  doClear() {
    this.syncService.deleteTransfers(this.syncPath?.id).then(() => {
      this.wasDeleted.emit()
      this.layout.closeDialog()
    })
  }
}
