import { Component, EventEmitter, HostListener, inject, Input, Output, signal } from '@angular/core'
import { LucideDynamicIcon, LucideLoader, LucideTrash } from '@lucide/angular'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { AutofocusDirective } from '../../../../common/directives/auto-focus.directive'
import { LayoutService } from '../../../../layout/layout.service'
import { FileModel } from '../../models/file.model'

@Component({
  selector: 'app-files-trash-dialog',
  templateUrl: 'files-trash-dialog.component.html',
  imports: [L10nTranslatePipe, L10nTranslateDirective, LucideDynamicIcon, AutofocusDirective]
})
export class FilesTrashDialogComponent {
  @Input() files: FileModel[] = []
  @Input() permanently = false
  @Output() removeFiles = new EventEmitter<void>()
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected layout = inject(LayoutService)
  protected readonly icons = { LucideTrash, LucideLoader }
  protected readonly submitted = signal(false)

  @HostListener('document:keyup.enter')
  onEnter() {
    this.onSubmit()
  }

  onSubmit() {
    if (!this.submitted()) {
      this.submitted.set(true)
      this.removeFiles.next()
      this.layout.closeDialog()
    }
  }
}
