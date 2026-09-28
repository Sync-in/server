import { Component, inject, Input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { LucideArrowRight, LucideDynamicIcon, LucideFile, LucideFileText, LucideFileTypeCorner } from '@lucide/angular'
import { COLLABORA_EDITOR } from '@sync-in-server/backend/src/applications/files/editors/collabora-online/collabora-online.constants'
import type { FileEditorProviders } from '@sync-in-server/backend/src/applications/files/editors/file-editor-providers.interface'
import {
  EURO_OFFICE_APP_LOCK,
  EURO_OFFICE_EDITOR,
  ONLY_OFFICE_APP_LOCK,
  ONLY_OFFICE_EDITOR
} from '@sync-in-server/backend/src/applications/files/editors/only-office/only-office.constants'
import type { UserPreferences } from '@sync-in-server/backend/src/applications/users/interfaces/user-preferences.interface'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective } from 'angular-l10n'
import { LayoutService } from '../../../../layout/layout.service'
import { StoreService } from '../../../../store/store.service'
import { UserService } from '../../../users/user.service'
import { FileModel } from '../../models/file.model'

@Component({
  selector: 'app-files-viewer-select-dialog',
  imports: [LucideDynamicIcon, L10nTranslateDirective, FormsModule],
  templateUrl: 'files-viewer-select-dialog.component.html',
  styleUrls: ['./files-viewer-select-dialog.scss']
})
export class FilesViewerSelectDialog {
  @Input({ required: true }) file: FileModel = null
  @Input({ required: true }) editorProvider: FileEditorProviders
  protected rememberChoice = false
  protected readonly collaboraEditor = COLLABORA_EDITOR
  protected readonly icons = { LucideFile, LucideFileTypeCorner, LucideArrowRight, LucideFileText }
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected layout = inject(LayoutService)
  private readonly store = inject(StoreService)
  private readonly userService = inject(UserService)
  protected readonly canRememberChoice = this.userService.user?.isLink === false
  protected readonly officeEditorProvider: NonNullable<UserPreferences['editor']> = this.store.server().files.editors.onlyoffice
    ? ONLY_OFFICE_EDITOR
    : EURO_OFFICE_EDITOR
  protected readonly officeEditorName = this.officeEditorProvider === EURO_OFFICE_EDITOR ? EURO_OFFICE_APP_LOCK : ONLY_OFFICE_APP_LOCK

  selectEditor(editor: NonNullable<UserPreferences['editor']>) {
    if (this.rememberChoice && this.canRememberChoice) {
      this.userService.setEditorProviderPreference(editor)
    }
    this.editorProvider[editor] = true
    this.layout.closeDialog()
  }
}
