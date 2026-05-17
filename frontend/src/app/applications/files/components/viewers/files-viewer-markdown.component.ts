import { CodeEditor } from '@acrodata/code-editor'
import { HttpClient, HttpErrorResponse } from '@angular/common/http'
import {
  Component,
  effect,
  HostListener,
  inject,
  input,
  model,
  OnDestroy,
  OnInit,
  signal,
  untracked,
  viewChild,
  ViewEncapsulation
} from '@angular/core'
import { FormsModule } from '@angular/forms'
import { redo, redoDepth, undo, undoDepth } from '@codemirror/commands'
import { LanguageDescription } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { closeSearchPanel, openSearchPanel } from '@codemirror/search'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import {
  faArrowsLeftRightToLine,
  faBold,
  faCode,
  faFloppyDisk,
  faHeading,
  faItalic,
  faKeyboard,
  faLink,
  faListOl,
  faListUl,
  faLock,
  faLockOpen,
  faMagnifyingGlass,
  faMinus,
  faParagraph,
  faPlus,
  faQuoteLeft,
  faReply,
  faShare,
  faSpinner,
  faSquareCheck,
  faStrikethrough,
  faTable,
  faTrashCan,
  faUnderline
} from '@fortawesome/free-solid-svg-icons'
import type { FileLockProps } from '@sync-in-server/backend/src/applications/files/interfaces/file-props.interface'
import { Editor } from '@tiptap/core'
import { TaskItem } from '@tiptap/extension-list'
import { TableKit } from '@tiptap/extension-table'
import { TaskList } from '@tiptap/extension-task-list'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { ButtonCheckboxDirective } from 'ngx-bootstrap/buttons'
import { BsDropdownModule } from 'ngx-bootstrap/dropdown'
import { TooltipModule } from 'ngx-bootstrap/tooltip'
import { TiptapEditorDirective } from 'ngx-tiptap'
import { firstValueFrom } from 'rxjs'
import { type AppWindow, themeDark } from '../../../../layout/layout.interfaces'
import { LayoutService } from '../../../../layout/layout.service'
import { FileModel } from '../../models/file.model'
import { FilesService } from '../../services/files.service'
import { FilesUploadService } from '../../services/files-upload.service'
import { fileLockPropsToString } from '../utils/file-lock.utils'

type MarkdownHeadingLevel = 1 | 2 | 3 | 4

@Component({
  selector: 'app-files-viewer-markdown',
  encapsulation: ViewEncapsulation.None,
  imports: [
    CodeEditor,
    TiptapEditorDirective,
    TooltipModule,
    FormsModule,
    ButtonCheckboxDirective,
    BsDropdownModule,
    FaIconComponent,
    L10nTranslatePipe,
    L10nTranslateDirective
  ],
  styleUrl: 'files-viewer-markdown.component.scss',
  templateUrl: 'files-viewer-markdown.component.html'
})
export class FilesViewerMarkdownComponent implements OnInit, OnDestroy {
  private readonly sourceEditor = viewChild<CodeEditor>('sourceEditor')
  currentHeight = input.required<number>()
  file = model.required<FileModel>()
  isWriteable = input.required<boolean>()
  isReadonly = model.required<boolean>()
  modalClosing = input.required<boolean>()
  protected isSupported = signal(false)
  protected isModified = signal(false)
  protected isSaving = signal(false)
  protected isSourceMode = signal(false)
  protected lineWrapping = signal(true)
  protected isSearchPanelOpen = signal(false)
  protected warnOnUnsavedChanges = signal(false)
  protected sourceContent = ''
  protected currentLanguage: string | undefined = undefined
  protected currentTheme: 'dark' | 'light' = 'light'
  protected readonly languages: LanguageDescription[] = languages
  protected readonly editor = new Editor({
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false
        }
      }),
      TaskList,
      TaskItem.configure({
        nested: true
      }),
      TableKit.configure({
        table: {
          resizable: true
        }
      }),
      Markdown
    ],
    editable: false,
    content: '',
    contentType: 'markdown',
    onUpdate: () => this.markModifiedIfNeeded()
  })
  protected readonly icons = {
    faArrowsLeftRightToLine,
    faBold,
    faCode,
    faFloppyDisk,
    faHeading,
    faItalic,
    faKeyboard,
    faLink,
    faListOl,
    faListUl,
    faLock,
    faLockOpen,
    faMagnifyingGlass,
    faMinus,
    faParagraph,
    faPlus,
    faQuoteLeft,
    faReply,
    faShare,
    faSquareCheck,
    faSpinner,
    faStrikethrough,
    faTable,
    faTrashCan,
    faUnderline
  }
  protected readonly headingLevels: MarkdownHeadingLevel[] = [1, 2, 3, 4]
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly layout = inject(LayoutService)
  private readonly http = inject(HttpClient)
  private readonly filesServices = inject(FilesService)
  private readonly filesUpload = inject(FilesUploadService)
  private readonly subscription = this.layout.switchTheme.subscribe((layout: string) => (this.currentTheme = layout === themeDark ? 'dark' : 'light'))
  private savedContent = ''

  constructor() {
    effect(() => {
      if (!this.modalClosing()) return
      const fileId = untracked(() => this.file().id)
      const modified = untracked(() => this.isModified())
      if (modified) {
        this.warnOnUnsavedChanges.set(true)
        if (this.layout.windows.getValue().find((w: AppWindow) => w.id === fileId)) {
          this.layout.restoreDialog(fileId)
        }
      } else {
        this.onClose().catch(console.error)
      }
    })
    effect(() => {
      const editable = !this.isReadonly() && this.isWriteable() && this.isSupported()
      if (!this.editor.isDestroyed) {
        this.editor.setEditable(editable, false)
      }
    })
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' || event.key === 'Esc') {
      event.preventDefault()
      event.stopPropagation()
      if (this.isSourceMode() && this.isSearchPanelOpen()) {
        this.toggleSearch()
      } else if (this.warnOnUnsavedChanges()) {
        this.warnOnUnsavedChanges.set(false)
      } else if (this.isModified()) {
        this.warnOnUnsavedChanges.set(true)
      } else {
        this.onClose().catch(console.error)
      }
      return
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      this.save()
      return
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f' && this.isSourceMode()) {
      event.preventDefault()
      event.stopPropagation()
      this.toggleSearch()
    }
  }

  async ngOnInit() {
    const language: LanguageDescription = LanguageDescription.matchFilename(languages, this.file().name)
    this.currentLanguage = language?.name || 'Markdown'
    this.isSupported.set(true)
    this.loadContent().catch(console.error)
  }

  ngOnDestroy() {
    this.subscription.unsubscribe()
    this.editor.destroy()
  }

  protected async toggleReadonly() {
    if (this.isReadonly()) {
      if (await this.lockFile()) {
        this.isReadonly.set(false)
      }
    } else {
      await this.unlockFile()
      this.isReadonly.set(true)
    }
  }

  protected save(exit = false) {
    if (!this.canSave()) return
    this.isSaving.set(true)
    const content = this.currentMarkdown()
    this.filesUpload.uploadOneFile(this.file(), content, true).subscribe({
      next: () => {
        this.sourceContent = content
        this.savedContent = content
        this.isModified.set(false)
        this.isSaving.set(false)
        this.warnOnUnsavedChanges.set(false)
        if (exit) {
          this.onClose().catch(console.error)
        }
        this.file().updateHTimeAgo()
      },
      error: (e: HttpErrorResponse) => {
        this.isSaving.set(false)
        this.layout.sendNotification('error', 'Unable to save document', e.error.message)
      }
    })
  }

  protected canSave(): boolean {
    return this.canEditContent() && this.isModified() && !this.isSaving()
  }

  protected onUndo() {
    if (this.isSourceMode()) {
      this.runSourceHistory(undo)
      return
    }
    this.runEditorCommand(() => this.editor.chain().focus().undo().run())
  }

  protected onRedo() {
    if (this.isSourceMode()) {
      this.runSourceHistory(redo)
      return
    }
    this.runEditorCommand(() => this.editor.chain().focus().redo().run())
  }

  protected canUndo(): boolean {
    if (this.isSourceMode()) {
      return this.canRunSourceHistory(undoDepth)
    }
    return this.canEditVisual() && !this.editor.isDestroyed && this.editor.can().undo()
  }

  protected canRedo(): boolean {
    if (this.isSourceMode()) {
      return this.canRunSourceHistory(redoDepth)
    }
    return this.canEditVisual() && !this.editor.isDestroyed && this.editor.can().redo()
  }

  protected toggleViewMode() {
    this.setSourceMode(!this.isSourceMode())
  }

  protected setSourceMode(sourceMode: boolean) {
    if (sourceMode === this.isSourceMode()) return
    if (!this.isSourceMode()) {
      this.sourceContent = this.editor.getMarkdown()
    }
    if (!sourceMode) {
      if (this.isSearchPanelOpen()) {
        this.toggleSearch()
      }
      this.editor.commands.setContent(this.sourceContent, { emitUpdate: false, contentType: 'markdown' })
    }
    this.isSourceMode.set(sourceMode)
    setTimeout(() => {
      if (sourceMode) {
        this.sourceEditor()?.view?.requestMeasure?.()
        this.sourceEditor()?.view?.focus()
      }
    })
  }

  protected sourceContentChange() {
    if (this.isSourceMode()) {
      this.markModifiedIfNeeded()
    }
  }

  protected toggleSearch() {
    const view = this.sourceView
    if (!this.isSourceMode() || !view) return
    this.isSearchPanelOpen.update((value) => !value)
    if (this.isSearchPanelOpen()) {
      openSearchPanel(view)
    } else {
      closeSearchPanel(view)
    }
  }

  protected setParagraph() {
    this.runEditorCommand(() => this.editor.chain().focus().setParagraph().run())
  }

  protected toggleHeading(level: MarkdownHeadingLevel) {
    this.runEditorCommand(() => this.editor.chain().focus().toggleHeading({ level }).run())
  }

  protected toggleBold() {
    this.runEditorCommand(() => this.editor.chain().focus().toggleBold().run())
  }

  protected toggleItalic() {
    this.runEditorCommand(() => this.editor.chain().focus().toggleItalic().run())
  }

  protected toggleUnderline() {
    this.runEditorCommand(() => this.editor.chain().focus().toggleUnderline().run())
  }

  protected toggleStrike() {
    this.runEditorCommand(() => this.editor.chain().focus().toggleStrike().run())
  }

  protected toggleCode() {
    this.runEditorCommand(() => this.editor.chain().focus().toggleCode().run())
  }

  protected toggleBulletList() {
    this.runEditorCommand(() => this.editor.chain().focus().toggleBulletList().run())
  }

  protected toggleOrderedList() {
    this.runEditorCommand(() => this.editor.chain().focus().toggleOrderedList().run())
  }

  protected toggleTaskList() {
    this.runEditorCommand(() => this.editor.chain().focus().toggleTaskList().run())
  }

  protected toggleBlockquote() {
    this.runEditorCommand(() => this.editor.chain().focus().toggleBlockquote().run())
  }

  protected toggleCodeBlock() {
    this.runEditorCommand(() => this.editor.chain().focus().toggleCodeBlock().run())
  }

  protected setHorizontalRule() {
    this.runEditorCommand(() => this.editor.chain().focus().setHorizontalRule().run())
  }

  protected setLink() {
    this.runEditorCommand(() => {
      const previousUrl = this.editor.getAttributes('link').href as string | undefined
      const url = window.prompt('URL', previousUrl || 'https://')
      if (url === null) return false
      if (!url.trim()) {
        return this.editor.chain().focus().extendMarkRange('link').unsetLink().run()
      }
      return this.editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()
    })
  }

  protected insertTable() {
    this.runEditorCommand(() => this.editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())
  }

  protected addTableRow(position: 'above' | 'below') {
    this.runEditorCommand(() => {
      const command = this.editor.chain().focus()
      return position === 'above' ? command.addRowBefore().run() : command.addRowAfter().run()
    })
  }

  protected deleteTableRow() {
    this.runEditorCommand(() => this.editor.chain().focus().deleteRow().run())
  }

  protected addTableColumn(position: 'left' | 'right') {
    this.runEditorCommand(() => {
      const command = this.editor.chain().focus()
      return position === 'left' ? command.addColumnBefore().run() : command.addColumnAfter().run()
    })
  }

  protected deleteTableColumn() {
    this.runEditorCommand(() => this.editor.chain().focus().deleteColumn().run())
  }

  protected deleteTable() {
    this.runEditorCommand(() => this.editor.chain().focus().deleteTable().run())
  }

  protected canEditTable(): boolean {
    return this.canEditVisual() && this.editor.isActive('table')
  }

  protected isSelectionActive(name: string, attributes?: object): boolean {
    return this.editor.isFocused && this.editor.isActive(name, attributes)
  }

  protected async onClose() {
    if (!this.isReadonly()) {
      await this.unlockFile()
    }
    this.layout.closeDialog(null, this.file().id)
  }

  private runEditorCommand(command: () => boolean) {
    if (this.canEditVisual() && !this.editor.isDestroyed) {
      command()
    }
  }

  protected canEditVisual(): boolean {
    return !this.isSourceMode() && this.canEditContent()
  }

  protected canEditContent(): boolean {
    return !this.isReadonly() && this.isWriteable()
  }

  private get sourceView() {
    return this.sourceEditor()?.view || null
  }

  private runSourceHistory(command: typeof undo) {
    const view = this.sourceView
    if (view && this.canEditContent()) {
      command({ state: view.state, dispatch: view.dispatch })
    }
  }

  private canRunSourceHistory(depth: typeof undoDepth): boolean {
    const view = this.sourceView
    return this.canEditContent() && !!view && depth(view.state) > 0
  }

  private currentMarkdown(): string {
    if (this.isSourceMode()) {
      return this.sourceContent
    }
    this.sourceContent = this.editor.getMarkdown()
    return this.sourceContent
  }

  private markModifiedIfNeeded() {
    const content = this.isSourceMode() ? this.sourceContent : this.editor.getMarkdown()
    this.isModified.set(content !== this.savedContent)
  }

  private async loadContent() {
    if (!this.isReadonly()) {
      await this.lockFile()
    }
    this.http.get(this.file().dataUrl, { responseType: 'text' }).subscribe({
      next: (data: string) => {
        this.savedContent = data
        this.sourceContent = data
        this.editor.commands.setContent(data, { emitUpdate: false, contentType: 'markdown' })
        this.isModified.set(false)
      },
      error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Unable to open document', this.file().name, e)
    })
  }

  private async lockFile(): Promise<boolean> {
    if (!this.isSupported() || !this.isWriteable()) return false
    try {
      const lock: FileLockProps = await firstValueFrom(this.filesServices.lock(this.file()))
      this.file.update((f) => {
        f.lock = lock
        return f
      })
      return true
    } catch (e) {
      this.lockError(e as HttpErrorResponse)
      return false
    }
  }

  private async unlockFile() {
    if (!this.isSupported() || !this.isWriteable()) return
    try {
      await firstValueFrom(this.filesServices.unlock(this.file()))
      this.file.update((f) => {
        delete f.lock
        return f
      })
    } catch (e) {
      this.lockError(e as HttpErrorResponse)
    }
  }

  private lockError(e: HttpErrorResponse) {
    this.isReadonly.set(true)
    this.isSupported.set(false)
    if (e.error?.owner) {
      const lock: FileLockProps = e.error
      this.file.update((f) => {
        f.lock = lock
        return f
      })
      this.layout.sendNotification('info', 'The file is locked', fileLockPropsToString(lock))
    } else {
      this.layout.sendNotification('warning', this.file().name, e.error.message)
    }
  }
}
