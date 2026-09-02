import { Component, inject, Input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { LucideArrowRight, LucideDynamicIcon, LucideFile, LucideFileText, LucideFileTypeCorner } from '@lucide/angular'
import type { FileEditorProviders } from '@sync-in-server/backend/src/applications/files/editors/file-editor-providers.interface'
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
  protected readonly icons = { LucideFile, LucideFileTypeCorner, LucideArrowRight, LucideFileText }
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected layout = inject(LayoutService)
  private readonly store = inject(StoreService)
  private readonly userService = inject(UserService)

  protected get officeEditorProvider(): keyof FileEditorProviders {
    return this.store.server().files.editors.onlyoffice ? 'onlyoffice' : 'eurooffice'
  }

  protected get officeEditorName(): string {
    return this.officeEditorProvider === 'eurooffice' ? 'Euro-Office' : 'OnlyOffice'
  }

  selectEditor(editor: keyof FileEditorProviders) {
    if (this.rememberChoice) {
      this.userService.setEditorProviderPreference(editor)
    }
    this.editorProvider[editor] = true
    this.layout.closeDialog()
  }
}
