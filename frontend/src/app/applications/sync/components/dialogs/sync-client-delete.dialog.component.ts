/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */
import { HttpErrorResponse } from '@angular/common/http'
import { ChangeDetectionStrategy, Component, EventEmitter, HostListener, Input, Output, inject } from '@angular/core'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faSpinner, faTrashCan } from '@fortawesome/free-solid-svg-icons'
import { L10nTranslateDirective } from 'angular-l10n'
import { LayoutService } from '../../../../layout/layout.service'
import { SyncClientModel } from '../../models/sync-client.model'
import { SyncService } from '../../services/sync.service'

@Component({
  selector: 'app-sync-client-delete-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FaIconComponent, L10nTranslateDirective],
  templateUrl: './sync-client-delete.dialog.component.html'
})
export class SyncClientDeleteDialogComponent {
  protected readonly layout = inject(LayoutService)
  private readonly syncService = inject(SyncService)
  @Input() client: SyncClientModel
  @Output() wasDeleted = new EventEmitter()
  protected readonly icons = { faSpinner, faTrashCan }
  protected submitted = false

  @HostListener('document:keyup.enter')
  onEnter() {
    this.onSubmit()
  }

  onSubmit() {
    if (!this.submitted) {
      this.submitted = true
      this.syncService.deleteClient(this.client.id).subscribe({
        next: () => {
          this.layout.sendNotification('info', 'Client deleted', this.client.info.node)
          this.wasDeleted.emit()
          this.layout.closeDialog()
        },
        error: (e: HttpErrorResponse) => {
          this.layout.sendNotification('error', 'Unable to delete client', e.error.message)
          this.submitted = false
        }
      })
    }
  }
}
