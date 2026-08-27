import { Component, inject, Input, output } from '@angular/core'
import { LucideDynamicIcon, LucideFileLock2 } from '@lucide/angular'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { LayoutService } from '../../../../layout/layout.service'
import { FileModel } from '../../models/file.model'

export type FilesOverwriteAction = 'cancel' | 'skip' | 'overwrite'

@Component({
  selector: 'app-files-overwrite-dialog',
  imports: [LucideDynamicIcon, L10nTranslateDirective, L10nTranslatePipe],
  templateUrl: 'files-overwrite-dialog.component.html'
})
export class FilesOverwriteDialogComponent {
  @Input({ required: true }) files: FileModel[] = []
  @Input() renamedTo: string
  public action = output<FilesOverwriteAction>()
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected layout = inject(LayoutService)
  protected readonly icons = { LucideFileLock2 }
  protected submitted = false

  onAction(action: FilesOverwriteAction) {
    this.submitted = true
    this.action.emit(action)
    this.layout.closeDialog()
  }
}
