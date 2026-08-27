import { Component, EventEmitter, inject, Input, Output } from '@angular/core'
import { LucideDynamicIcon, LucideTrash2 } from '@lucide/angular'
import { L10nTranslateDirective } from 'angular-l10n'
import { LayoutService } from '../../../../layout/layout.service'
import { SyncPathModel } from '../../models/sync-path.model'
import { SyncService } from '../../services/sync.service'

@Component({
  selector: 'app-sync-transfers-delete-dialog',
  imports: [L10nTranslateDirective, LucideDynamicIcon],
  templateUrl: './sync-transfers-delete.dialog.component.html'
})
export class SyncTransfersDeleteDialogComponent {
  @Input() syncPath: SyncPathModel = null
  @Output() wasDeleted = new EventEmitter<void>()
  protected readonly layout = inject(LayoutService)
  protected readonly icons = { LucideTrash2 }
  private readonly syncService = inject(SyncService)

  doClear() {
    this.syncService.deleteTransfers(this.syncPath?.id).then(() => {
      this.wasDeleted.emit()
      this.layout.closeDialog()
    })
  }
}
