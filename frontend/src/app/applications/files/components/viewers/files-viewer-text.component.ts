import { CodeEditor } from '@acrodata/code-editor'
import { Component, HostListener, OnDestroy, OnInit, signal, viewChild, ViewEncapsulation } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { redo, redoDepth, undo, undoDepth } from '@codemirror/commands'
import { LanguageDescription } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import {
  faArrowsLeftRightToLine,
  faFloppyDisk,
  faLock,
  faLockOpen,
  faMagnifyingGlass,
  faReply,
  faShare,
  faSpinner
} from '@fortawesome/free-solid-svg-icons'
import { L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { ButtonCheckboxDirective } from 'ngx-bootstrap/buttons'
import { TooltipModule } from 'ngx-bootstrap/tooltip'
import { FilesViewerEditableBase } from './files-viewer-editable-base'
import { CodeMirrorFileViewerSearchAdapter } from './components/files-viewer-search-adapter'
import { FilesViewerSearchComponent } from './components/files-viewer-search.component'

@Component({
  selector: 'app-files-viewer-text',
  encapsulation: ViewEncapsulation.None,
  imports: [
    CodeEditor,
    TooltipModule,
    FormsModule,
    FaIconComponent,
    L10nTranslatePipe,
    ButtonCheckboxDirective,
    L10nTranslateDirective,
    FilesViewerSearchComponent
  ],
  styles: [
    `
      .files-viewer-text {
        position: relative;
      }

      .code-editor {
        font-size: 0.85rem;
        height: calc(100% - 40px);
      }

      .cm-focused {
        outline: none !important;
      }

      .cm-panel.cm-search {
        display: none;
      }
    `
  ],
  templateUrl: 'files-viewer-text.component.html'
})
export class FilesViewerTextComponent extends FilesViewerEditableBase implements OnInit, OnDestroy {
  editor = viewChild<CodeEditor>('editor')
  protected lineWrapping = signal(false)
  protected content = ''
  protected currentLanguage = undefined
  protected readonly languages: LanguageDescription[] = languages
  protected readonly icons = { faFloppyDisk, faLock, faLockOpen, faMagnifyingGlass, faSpinner, faArrowsLeftRightToLine, faReply, faShare }
  protected readonly searchAdapter = new CodeMirrorFileViewerSearchAdapter(() => this.editor()?.view)
  protected readonly isSearchPanelOpen = this.searchAdapter.isOpen
  private focusRafId: number | null = null
  private savedContent = ''

  constructor() {
    super()
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    // ESC
    if (event.key === 'Escape' || event.key === 'Esc') {
      event.preventDefault()
      if (this.isSearchPanelOpen()) {
        event.stopPropagation()
        this.toggleSearch()
      } else if (this.warnOnUnsavedChanges()) {
        event.stopPropagation()
        this.warnOnUnsavedChanges.set(false)
      } else if (this.isModified()) {
        event.stopPropagation()
        this.warnOnUnsavedChanges.set(true)
      } else {
        event.stopPropagation()
        this.onClose().catch(console.error)
      }
      return
    }
    // Ctrl/Cmd+S | Ctrl/Cmd+F
    if (event.ctrlKey || event.metaKey) {
      switch (event.key.toLowerCase()) {
        case 's':
          event.preventDefault()
          this.save()
          return
        case 'f':
          event.preventDefault()
          event.stopPropagation()
          this.toggleSearch()
          return
      }
    }
  }

  ngOnInit() {
    const language: LanguageDescription = LanguageDescription.matchFilename(languages, this.file().name)
    this.currentLanguage = language?.name
    this.isSupported.set(true)
    this.loadContent().catch(console.error)
  }

  override ngOnDestroy() {
    super.ngOnDestroy()
    if (this.focusRafId !== null) {
      cancelAnimationFrame(this.focusRafId)
    }
  }

  toggleSearch() {
    this.searchAdapter.toggle()
  }

  contentChange(content: string) {
    this.isModified.set(content !== this.savedContent)
  }

  onUndo() {
    if (!this.canEditContent()) return
    undo({ state: this.editor().view.state, dispatch: this.editor().view.dispatch })
  }

  onRedo() {
    if (!this.canEditContent()) return
    redo({ state: this.editor().view.state, dispatch: this.editor().view.dispatch })
  }

  canUndo(): boolean {
    if (this.canEditContent() && this.editor()?.view) {
      return undoDepth(this.editor().view.state) > 0
    }
    return false
  }

  canRedo(): boolean {
    if (this.canEditContent() && this.editor()?.view) {
      return redoDepth(this.editor().view.state) > 0
    }
    return false
  }

  protected currentFileContent(): string {
    return this.content
  }

  protected onContentLoaded(content: string) {
    this.savedContent = content
    this.content = content
    this.isModified.set(false)
    this.scheduleEditorFocus(0)
  }

  protected override onContentSaved(content: string) {
    this.savedContent = content
  }

  protected override onSaveFinished() {
    this.scheduleEditorFocus(undefined, true)
  }

  private scheduleEditorFocus(position?: number, onlyIfUnfocused = false) {
    if (this.focusRafId !== null) {
      cancelAnimationFrame(this.focusRafId)
    }
    this.focusRafId = requestAnimationFrame(() => {
      this.focusRafId = null
      if (onlyIfUnfocused && !this.canRestoreEditorFocus()) return
      const view = this.editor()?.view
      if (!view) return
      if (position !== undefined) {
        view.dispatch({ selection: { anchor: position }, scrollIntoView: true })
      }
      view.focus()
    })
  }
}
