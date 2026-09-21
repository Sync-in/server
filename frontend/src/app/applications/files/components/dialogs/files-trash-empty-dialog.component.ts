import { HttpErrorResponse } from '@angular/common/http'
import { Component, HostListener, inject, Input } from '@angular/core'
import { LucideDynamicIcon, LucideLoader, LucideTrash } from '@lucide/angular'
import { L10nTranslateDirective } from 'angular-l10n'
import { LayoutService } from '../../../../layout/layout.service'
import { FilesService } from '../../services/files.service'

@Component({
  selector: 'app-files-trash-empty-dialog',
  imports: [LucideDynamicIcon, L10nTranslateDirective],
  templateUrl: 'files-trash-empty-dialog.component.html'
})
export class FilesTrashEmptyDialogComponent {
  @Input() trashAlias = ''
  @Input() trashName = ''
  protected layout = inject(LayoutService)
  protected readonly icons = { LucideTrash, LucideLoader }
  protected submitted = false
  private filesService = inject(FilesService)

  @HostListener('document:keyup.enter')
  onEnter() {
    this.onSubmit()
  }

  onSubmit() {
    if (this.submitted || !this.trashAlias) return
    this.submitted = true
    this.filesService.emptyTrash(this.trashAlias, this.trashName).subscribe({
      next: () => this.layout.closeDialog(),
      error: (error: HttpErrorResponse) => {
        this.submitted = false
        this.layout.sendNotification('error', 'Deletion failed', this.trashName, error)
      }
    })
  }
}
