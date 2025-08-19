/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { ChangeDetectionStrategy, Component, EventEmitter, HostListener, inject, Input, Output } from '@angular/core'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faSpinner, faTrashCan } from '@fortawesome/free-solid-svg-icons'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { LayoutService } from '../../../../layout/layout.service'
import { FileModel } from '../../models/file.model'

@Component({
  selector: 'app-files-trash-dialog',
  templateUrl: 'files-trash-dialog.component.html',
  imports: [L10nTranslatePipe, L10nTranslateDirective, FaIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FilesTrashDialogComponent {
  @Input() files: FileModel[] = []
  @Input() permanently = false
  @Output() removeFiles = new EventEmitter<void>()
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected layout = inject(LayoutService)
  protected readonly icons = { faTrashCan, faSpinner }
  protected submitted = false

  @HostListener('document:keyup.enter')
  onEnter() {
    this.onSubmit()
  }

  onSubmit() {
    if (!this.submitted) {
      this.submitted = true
      this.removeFiles.next()
      this.layout.closeDialog()
    }
  }
}
