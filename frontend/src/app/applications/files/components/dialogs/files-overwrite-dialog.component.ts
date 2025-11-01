/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Component, HostListener, inject, Input, output } from '@angular/core'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faFileShield } from '@fortawesome/free-solid-svg-icons'
import { L10nTranslateDirective } from 'angular-l10n'
import { LayoutService } from '../../../../layout/layout.service'

@Component({
  selector: 'app-files-overwrite-dialog',
  imports: [FaIconComponent, L10nTranslateDirective],
  templateUrl: 'files-overwrite-dialog.component.html'
})
export class FilesOverwriteDialogComponent {
  @Input() files: File[] = []
  public overwrite = output<boolean>()
  protected layout = inject(LayoutService)
  protected readonly icons = { faFileShield }
  protected submitted = false

  @HostListener('document:keyup.enter')
  onEnter() {
    this.onAction(true)
  }

  @HostListener('document:keyup.escape')
  onEsc() {
    this.onAction(false)
  }

  onAction(overwrite: boolean) {
    this.submitted = overwrite
    this.overwrite.emit(overwrite)
    this.layout.closeDialog()
  }
}
