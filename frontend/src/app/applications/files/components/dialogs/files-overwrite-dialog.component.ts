import { ChangeDetectionStrategy, Component, inject, Input, output, signal } from '@angular/core'
import { LucideDynamicIcon, LucideFileLock } from '@lucide/angular'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { LayoutService } from '../../../../layout/layout.service'
import type { FilesOverwriteAction } from '../../interfaces/files-dialog.interface'
import { FileModel } from '../../models/file.model'

export type { FilesOverwriteAction } from '../../interfaces/files-dialog.interface'

@Component({
  selector: 'app-files-overwrite-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideDynamicIcon, L10nTranslateDirective, L10nTranslatePipe],
  templateUrl: 'files-overwrite-dialog.component.html'
})
export class FilesOverwriteDialogComponent {
  @Input({ required: true }) files: FileModel[] = []
  @Input() renamedTo: string
  public readonly action = output<FilesOverwriteAction>()
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected layout = inject(LayoutService)
  protected readonly icons = { LucideFileLock }
  protected readonly submitted = signal(false)

  onAction(action: FilesOverwriteAction) {
    this.submitted.set(true)
    this.action.emit(action)
    this.layout.closeDialog()
  }
}
