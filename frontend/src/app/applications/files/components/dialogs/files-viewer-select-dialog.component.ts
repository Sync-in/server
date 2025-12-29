/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Component, inject, Input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faFile, faFileLines, faFileWord } from '@fortawesome/free-regular-svg-icons'
import { faArrowRight } from '@fortawesome/free-solid-svg-icons'
import type { FileEditorProvider } from '@sync-in-server/backend/src/configuration/config.interfaces'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective } from 'angular-l10n'
import { LayoutService } from '../../../../layout/layout.service'
import { UserService } from '../../../users/user.service'
import { FileModel } from '../../models/file.model'

@Component({
  selector: 'app-files-viewer-select-dialog',
  imports: [FaIconComponent, L10nTranslateDirective, FormsModule],
  templateUrl: 'files-viewer-select-dialog.component.html',
  styleUrls: ['./files-viewer-select-dialog.scss']
})
export class FilesViewerSelectDialog {
  @Input({ required: true }) file: FileModel = null
  @Input({ required: true }) editorProvider: FileEditorProvider
  protected rememberChoice = false
  protected readonly icons = { faFile, faFileWord, faArrowRight, faFileLines }
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected layout = inject(LayoutService)
  private readonly userService = inject(UserService)

  selectEditor(editor: keyof FileEditorProvider) {
    if (this.rememberChoice) {
      this.userService.setEditorProviderPreference(editor)
    }
    this.editorProvider[editor] = true
    this.layout.closeDialog()
  }
}
