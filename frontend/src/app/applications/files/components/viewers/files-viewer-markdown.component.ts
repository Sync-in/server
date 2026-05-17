import { CodeEditor } from '@acrodata/code-editor'
import { Component, effect, ElementRef, HostListener, OnDestroy, OnInit, signal, viewChild, ViewEncapsulation } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { redo, redoDepth, undo, undoDepth } from '@codemirror/commands'
import { LanguageDescription } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { closeSearchPanel, openSearchPanel } from '@codemirror/search'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faSquareMinus, faSquarePlus } from '@fortawesome/free-regular-svg-icons'
import {
  faArrowsLeftRightToLine,
  faBold,
  faCode,
  faEye,
  faFloppyDisk,
  faHeading,
  faImage,
  faItalic,
  faKeyboard,
  faLink,
  faListOl,
  faListUl,
  faLock,
  faLockOpen,
  faMagnifyingGlass,
  faMinus,
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
import { Editor, Extension, type Range } from '@tiptap/core'
import Image, { type SetImageOptions } from '@tiptap/extension-image'
import { TaskItem } from '@tiptap/extension-list'
import { TableKit } from '@tiptap/extension-table'
import { TaskList } from '@tiptap/extension-task-list'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { ButtonCheckboxDirective } from 'ngx-bootstrap/buttons'
import { BsDropdownModule } from 'ngx-bootstrap/dropdown'
import { TooltipModule } from 'ngx-bootstrap/tooltip'
import { TiptapEditorDirective } from 'ngx-tiptap'
import { FilesViewerEditableBase } from './files-viewer-editable-base'

type MarkdownHeadingLevel = 1 | 2 | 3 | 4
type MarkdownInlineMark = 'bold' | 'code' | 'italic' | 'strike' | 'underline'

const ExitInlineCodeOnEnter = Extension.create({
  name: 'exitInlineCodeOnEnter',

  addKeyboardShortcuts() {
    return {
      Enter: () => {
        if (!this.editor.isActive('code') || this.editor.isActive('codeBlock')) return false
        return this.editor.chain().splitBlock().unsetMark('code').run()
      }
    }
  }
})

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
export class FilesViewerMarkdownComponent extends FilesViewerEditableBase implements OnInit, OnDestroy {
  private readonly sourceEditor = viewChild<CodeEditor>('sourceEditor')
  private readonly imageFileInput = viewChild<ElementRef<HTMLInputElement>>('imageFileInput')
  protected isSourceMode = signal(false)
  protected lineWrapping = signal(false)
  protected isSearchPanelOpen = signal(false)
  protected sourceContent = ''
  protected currentLanguage: string | undefined = undefined
  protected readonly languages: LanguageDescription[] = languages
  protected readonly editor = new Editor({
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false
        }
      }),
      ExitInlineCodeOnEnter,
      TaskList,
      TaskItem.configure({
        nested: true
      }),
      TableKit.configure({
        table: {
          resizable: true
        }
      }),
      Image.configure({
        allowBase64: true
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
    faEye,
    faFloppyDisk,
    faHeading,
    faImage,
    faItalic,
    faKeyboard,
    faLink,
    faListOl,
    faListUl,
    faLock,
    faLockOpen,
    faMagnifyingGlass,
    faMinus,
    faPlus,
    faQuoteLeft,
    faReply,
    faShare,
    faSquareCheck,
    faSpinner,
    faStrikethrough,
    faTable,
    faTrashCan,
    faUnderline,
    faSquareMinus,
    faSquarePlus
  }
  protected readonly headingLevels: MarkdownHeadingLevel[] = [1, 2, 3, 4]
  private savedContent = ''

  constructor() {
    super()
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

  override ngOnDestroy() {
    super.ngOnDestroy()
    this.editor.destroy()
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
      this.setMarkdownContent(this.sourceContent)
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

  protected toggleHeading(level: MarkdownHeadingLevel) {
    this.runEditorCommand(() => this.editor.chain().focus().toggleHeading({ level }).run())
  }

  protected toggleBold() {
    this.toggleInlineMark('bold')
  }

  protected toggleItalic() {
    this.toggleInlineMark('italic')
  }

  protected toggleUnderline() {
    this.toggleInlineMark('underline')
  }

  protected toggleStrike() {
    this.toggleInlineMark('strike')
  }

  protected toggleCode() {
    this.toggleInlineMark('code')
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

  protected openImageFilePicker() {
    this.runEditorCommand(() => {
      const inputElement = this.imageFileInput()?.nativeElement
      if (!inputElement) return false
      inputElement.value = ''
      inputElement.click()
      return true
    })
  }

  protected insertImageFromFile(event: Event) {
    const inputElement = event.target as HTMLInputElement
    const imageFile = inputElement.files?.[0]
    inputElement.value = ''
    if (!imageFile || !this.canEditVisual()) return
    if (!imageFile.type.startsWith('image/')) {
      this.layout.sendNotification('error', 'Unable to insert image', 'Unsupported image file')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const src = typeof reader.result === 'string' ? reader.result : ''
      if (!src) {
        this.layout.sendNotification('error', 'Unable to insert image', imageFile.name)
        return
      }
      this.insertImage({ src, alt: imageFile.name })
    }
    reader.onerror = () => this.layout.sendNotification('error', 'Unable to insert image', imageFile.name)
    reader.readAsDataURL(imageFile)
  }

  protected insertImageFromUrl() {
    this.runEditorCommand(() => {
      const previousSrc = this.editor.getAttributes('image').src as string | undefined
      const src = window.prompt('Image URL', previousSrc || 'https://')
      if (src === null || !src.trim()) return false
      const previousAlt = this.editor.getAttributes('image').alt as string | undefined
      const alt = window.prompt('Alternative text', previousAlt || '')
      if (alt === null) return false
      return this.insertImage({ src: src.trim(), alt: alt.trim() || undefined })
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

  private runEditorCommand(command: () => boolean) {
    if (this.canEditVisual() && !this.editor.isDestroyed) {
      command()
    }
  }

  private toggleInlineMark(markName: MarkdownInlineMark) {
    this.runEditorCommand(() => {
      const wordRange = this.currentWordRange()
      if (!wordRange) {
        return this.editor.chain().focus().toggleMark(markName, {}, { extendEmptyMarkRange: true }).run()
      }

      const cursorPosition = this.editor.state.selection.from
      const command = this.editor.chain().focus().setTextSelection(wordRange)
      return (this.editor.isActive(markName) ? command.unsetMark(markName) : command.setMark(markName)).setTextSelection(cursorPosition).run()
    })
  }

  private insertImage(options: SetImageOptions): boolean {
    return this.canEditVisual() && !this.editor.isDestroyed && this.editor.chain().focus().setImage(options).run()
  }

  private currentWordRange(): Range | null {
    const { selection } = this.editor.state
    if (!selection.empty) return null

    const { $from } = selection
    const text = $from.parent.textBetween(0, $from.parent.content.size, '\n', '\ufffc')
    const offset = $from.parentOffset

    if (!this.isWordCharacter(text[offset - 1]) && !this.isWordCharacter(text[offset])) {
      return null
    }

    let start = offset
    let end = offset

    while (start > 0 && this.isWordCharacter(text[start - 1])) {
      start--
    }

    while (end < text.length && this.isWordCharacter(text[end])) {
      end++
    }

    if (start === end) return null

    return {
      from: $from.start() + start,
      to: $from.start() + end
    }
  }

  private isWordCharacter(character: string | undefined): boolean {
    return !!character && /[\p{L}\p{N}_]/u.test(character)
  }

  protected canEditVisual(): boolean {
    return !this.isSourceMode() && this.canEditContent()
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

  protected currentFileContent(): string {
    return this.currentMarkdown()
  }

  protected onContentLoaded(content: string) {
    this.savedContent = content
    this.sourceContent = content
    this.setMarkdownContent(content)
    this.isModified.set(false)
  }

  protected override onContentSaved(content: string) {
    this.sourceContent = content
    this.savedContent = content
  }

  private markModifiedIfNeeded() {
    const content = this.isSourceMode() ? this.sourceContent : this.editor.getMarkdown()
    this.isModified.set(content !== this.savedContent)
  }

  private setMarkdownContent(content: string) {
    this.editor.chain().setMeta('addToHistory', false).setContent(content, { emitUpdate: false, contentType: 'markdown' }).run()
  }
}
