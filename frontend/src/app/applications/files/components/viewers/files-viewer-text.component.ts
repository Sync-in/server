import { CodeEditor } from '@acrodata/code-editor'
import { Component, effect, HostListener, OnInit, signal, untracked, viewChild, ViewEncapsulation } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { redo, redoDepth, undo, undoDepth } from '@codemirror/commands'
import { LanguageDescription } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { closeSearchPanel, openSearchPanel } from '@codemirror/search'
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

@Component({
  selector: 'app-files-viewer-text',
  encapsulation: ViewEncapsulation.None,
  imports: [CodeEditor, TooltipModule, FormsModule, FaIconComponent, L10nTranslatePipe, ButtonCheckboxDirective, L10nTranslateDirective],
  styles: [
    `
      .code-editor {
        height: calc(100% - 40px);
      }

      .cm-focused {
        outline: none !important;
      }

      .cm-panel.cm-search {
        display: flex;
        align-items: center;
        text-wrap: nowrap;

        label {
          display: flex;
          align-items: center;
        }

        button[aria-label='close'] {
          display: none;
        }
      }
    `
  ],
  templateUrl: 'files-viewer-text.component.html'
})
export class FilesViewerTextComponent extends FilesViewerEditableBase implements OnInit {
  editor = viewChild<CodeEditor>('editor')
  protected lineWrapping = signal(false)
  protected content: any = false
  protected currentLanguage = undefined
  protected readonly languages: LanguageDescription[] = languages
  protected readonly icons = { faFloppyDisk, faLock, faLockOpen, faMagnifyingGlass, faSpinner, faArrowsLeftRightToLine, faReply, faShare }
  protected isSearchPanelOpen = signal(false)
  private isContentReady = false

  constructor() {
    super()
    effect(() => {
      this.isReadonly()
      // Reset search state when open to enable/disable the replace function
      const isSearchPanelIsOpen = untracked(() => this.isSearchPanelOpen())
      if (isSearchPanelIsOpen) {
        setTimeout(() => {
          this.toggleSearch()
          this.toggleSearch()
        }, 100)
      }
    })
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

  async ngOnInit() {
    const language: LanguageDescription = LanguageDescription.matchFilename(languages, this.file().name)
    this.currentLanguage = language?.name
    this.isSupported.set(true)
    this.loadContent().catch(console.error)
  }

  toggleSearch() {
    this.isSearchPanelOpen.update((value) => !value)
    if (this.isSearchPanelOpen()) {
      openSearchPanel(this.editor().view)
    } else {
      closeSearchPanel(this.editor().view)
    }
  }

  contentChange() {
    // Ignore first call
    if (this.isContentReady) {
      this.isModified.set(true)
    } else {
      this.isContentReady = true
    }
  }

  onUndo() {
    undo({ state: this.editor().view.state, dispatch: this.editor().view.dispatch })
  }

  onRedo() {
    redo({ state: this.editor().view.state, dispatch: this.editor().view.dispatch })
  }

  canUndo(): boolean {
    if (this.editor()?.view) {
      return undoDepth(this.editor().view.state) > 0
    }
    return false
  }

  canRedo(): boolean {
    if (this.editor()?.view) {
      return redoDepth(this.editor().view.state) > 0
    }
    return false
  }

  protected currentFileContent(): string {
    return this.content || ''
  }

  protected onContentLoaded(content: string) {
    this.content = content
  }
}
