/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Component, HostListener, inject, Input } from '@angular/core'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faSpinner, faTrashCan } from '@fortawesome/free-solid-svg-icons'
import { L10nTranslateDirective } from 'angular-l10n'
import { LayoutService } from '../../../../layout/layout.service'
import { FileModel } from '../../models/file.model'
import { FilesService } from '../../services/files.service'

@Component({
  selector: 'app-files-trash-empty-dialog',
  imports: [FaIconComponent, L10nTranslateDirective],
  templateUrl: 'files-trash-empty-dialog.component.html'
})
export class FilesTrashEmptyDialogComponent {
  @Input() files: FileModel[] = []
  protected layout = inject(LayoutService)
  protected readonly icons = { faTrashCan, faSpinner }
  protected submitted = false
  private filesService = inject(FilesService)

  @HostListener('document:keyup.enter')
  onEnter() {
    this.onSubmit()
  }

  onSubmit() {
    if (!this.submitted) {
      this.submitted = true
      this.filesService.delete(this.files)
      this.layout.closeDialog()
      this.submitted = false
    }
  }
}
