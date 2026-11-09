import { NgTemplateOutlet } from '@angular/common'
import { Component, computed, HostListener, inject, Input, model, OnInit, output, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { LucideDynamicIcon, LucideEye, LucidePencil } from '@lucide/angular'
import { FILE_MODE } from '@sync-in-server/backend/src/applications/files/constants/operations'
import type { FileEditorProviders } from '@sync-in-server/backend/src/applications/files/editors/file-editor-providers.interface'
import { L10nTranslateDirective } from 'angular-l10n'
import { map } from 'rxjs'
import { LayoutService } from '../../../../layout/layout.service'
import { StoreService } from '../../../../store/store.service'
import { SHORT_MIME } from '../../files.constants'
import type { FileChangeHandler } from '../../interfaces/file-viewer.interface'
import { FileModel } from '../../models/file.model'
import { FilesViewerCollaboraOnlineComponent } from '../viewers/files-viewer-collabora-online.component'
import { FilesViewerDrawioComponent } from '../viewers/files-viewer-drawio.component'
import { FilesViewerImageComponent } from '../viewers/files-viewer-image.component'
import { FilesViewerMarkdownComponent } from '../viewers/files-viewer-markdown.component'
import { FilesViewerMediaComponent } from '../viewers/files-viewer-media.component'
import { FilesViewerOnlyOfficeComponent } from '../viewers/files-viewer-only-office.component'
import { FilesViewerPdfComponent } from '../viewers/files-viewer-pdf.component'
import { FilesViewerTextComponent } from '../viewers/files-viewer-text.component'

@Component({
  selector: 'app-files-viewer-dialog',
  imports: [
    NgTemplateOutlet,
    FilesViewerPdfComponent,
    FilesViewerMediaComponent,
    FilesViewerTextComponent,
    FilesViewerMarkdownComponent,
    FilesViewerImageComponent,
    LucideDynamicIcon,
    FilesViewerOnlyOfficeComponent,
    FilesViewerCollaboraOnlineComponent,
    FilesViewerDrawioComponent,
    L10nTranslateDirective
  ],
  templateUrl: 'files-viewer-dialog.component.html'
})
export class FilesViewerDialogComponent implements OnInit {
  @Input({ required: true }) currentFile: FileModel
  @Input({ required: true }) directoryFiles: FileModel[]
  @Input({ required: true }) mode: FILE_MODE
  @Input({ required: true }) isWriteable: boolean
  @Input({ required: true }) hookedShortMime: string
  @Input({ required: true }) editorProvider: FileEditorProviders
  @Input() fileChangeHandler?: FileChangeHandler
  readonly fileChange = output<FileModel>()
  protected readonly currentFileState = signal<FileModel | null>(null, { equal: () => false })
  protected readonly directoryFilesState = signal<FileModel[]>([])
  private readonly modeState = signal<FILE_MODE>(undefined)
  protected readonly isWriteableState = signal(false)
  protected readonly hookedShortMimeState = signal('')
  protected readonly editorProviderState = signal<FileEditorProviders | null>(null)
  readonly modalClosing = signal<boolean>(false)
  protected readonly activeViewer = signal<string>('')
  protected readonly editableViewerReady = signal(false)
  protected readonly isReadonly = model<boolean>(true)
  protected readonly SHORT_MIME = SHORT_MIME
  protected readonly icons = { LucideEye, LucidePencil }
  protected readonly directoryImages = computed(() => this.directoryFilesState().filter((file) => file.isImage))
  protected readonly canToggleViewer = computed(
    () => this.isWriteableState() && !!this.currentFileState()?.isEditable && this.hookedShortMimeState() === SHORT_MIME.PDF
  )
  protected readonly store = inject(StoreService)
  private readonly layout = inject(LayoutService)
  protected readonly officeEditorName = computed(() => (this.store.server().files.editors.onlyoffice ? 'OnlyOffice' : 'Euro-Office'))
  protected readonly toggleViewerText = computed(() =>
    this.isReadonly()
      ? this.layout.translateString('edit_in_office_editor', { editor: this.officeEditorName() })
      : this.layout.translateString('View in PDF.js')
  )
  private openedFile: { path: string; name: string; mimeUrl: string }
  private readonly offsetTop = 42
  protected readonly currentHeight = toSignal(this.layout.resizeEvent.pipe(map(() => window.innerHeight - this.offsetTop)), {
    initialValue: window.innerHeight - this.offsetTop
  })

  ngOnInit() {
    this.currentFileState.set(this.currentFile)
    this.directoryFilesState.set(this.directoryFiles)
    this.modeState.set(this.mode)
    this.isWriteableState.set(this.isWriteable)
    this.hookedShortMimeState.set(this.hookedShortMime)
    this.editorProviderState.set(this.editorProvider)
    this.activeViewer.set(this.hookedShortMimeState())
    this.isReadonly.set(this.hookedShortMimeState() === SHORT_MIME.PDF || this.modeState() === FILE_MODE.VIEW || !this.currentFile.isEditable)
    this.openedFile = { path: this.currentFile.path, name: this.currentFile.name, mimeUrl: this.currentFile.mimeUrl }
  }

  onClose() {
    const isEditableViewer =
      this.hookedShortMimeState() === SHORT_MIME.TEXT ||
      this.hookedShortMimeState() === SHORT_MIME.MARKDOWN ||
      this.hookedShortMimeState() === SHORT_MIME.DIAGRAM
    if (isEditableViewer && this.editableViewerReady()) {
      // Prevent closing the modal without saving when using text-based editors
      this.modalClosing.set(true)
      // Force the next state change
      setTimeout(() => this.modalClosing.set(false), 1000)
    } else {
      this.layout.closeDialog(null, this.openedFile.path)
    }
  }

  onMinimize() {
    this.layout.minimizeDialog(this.openedFile.path, { name: this.openedFile.name, mimeUrl: this.openedFile.mimeUrl })
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent) {
    const activeViewer = this.activeViewer()
    if (activeViewer === SHORT_MIME.IMAGE || activeViewer === SHORT_MIME.PDF) return

    event.preventDefault()
    event.returnValue = ''
  }

  protected toggleViewer(): void {
    if (this.activeViewer() === SHORT_MIME.PDF) {
      this.activeViewer.set(SHORT_MIME.DOCUMENT)
      this.isReadonly.set(false)
    } else {
      this.activeViewer.set(SHORT_MIME.PDF)
      this.isReadonly.set(true)
    }
  }

  protected notifyFileChange(file: FileModel) {
    this.currentFileState.set(file)
    this.fileChange.emit(file)
    this.fileChangeHandler?.(file)
  }
}
