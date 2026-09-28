import { HttpClient, HttpErrorResponse } from '@angular/common/http'
import { Component, ElementRef, HostListener, inject, input, OnInit, signal, viewChild } from '@angular/core'
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser'
import type { DrawioSettingsDto } from '@sync-in-server/backend/src/applications/files/editors/drawio/drawio.dtos'
import { DRAWIO_IMPORT_EXTENSIONS, EMPTY_DRAWIO_XML } from '@sync-in-server/backend/src/applications/files/editors/drawio/drawio.constants'
import { API_DRAWIO_SETTINGS } from '@sync-in-server/backend/src/applications/files/editors/drawio/drawio.routes'
import { USER_THEME } from '@sync-in-server/backend/src/applications/users/constants/user-preferences'
import { forbiddenChars, isValidFileName } from '@sync-in-server/backend/src/common/shared'
import { L10nTranslateDirective } from 'angular-l10n'
import type { BsModalRef } from 'ngx-bootstrap/modal'
import { firstValueFrom, take } from 'rxjs'
import { StoreService } from '../../../../store/store.service'
import { MAX_CLIENT_EDITOR_FILE_SIZE } from '../../files.constants'
import type { FileModel } from '../../models/file.model'
import { FilesUploadService } from '../../services/files-upload.service'
import { FilesViewerSaveAsComponent } from './components/files-viewer-save-as.component'
import { FilesViewerUnsavedChangesComponent } from './components/files-viewer-unsaved-changes.component'
import { FilesViewerEditableBase } from './files-viewer-editable-base'
import type { DrawioEditorEvent, DrawioInitializationMode } from './interfaces/files-viewer-drawio.interface'

@Component({
  selector: 'app-files-viewer-drawio',
  imports: [L10nTranslateDirective, FilesViewerUnsavedChangesComponent],
  styles: [
    `
      .drawio-viewer {
        position: relative;
      }

      .drawio-viewer__frame {
        width: 100%;
        height: 100%;
        border: 0;
      }

      .drawio-viewer__state {
        position: absolute;
        z-index: 1;
        inset: 0;
        background: var(--bs-body-bg);
      }
    `
  ],
  template: `
    <div class="drawio-viewer" [style.height.px]="currentHeight()">
      @if (loading()) {
        <div class="drawio-viewer__state d-flex align-items-center justify-content-center" role="status">
          <span class="spinner-border text-primary" aria-hidden="true"></span>
          <span class="visually-hidden" l10nTranslate>Loading...</span>
        </div>
      } @else if (loadFailed()) {
        <div class="drawio-viewer__state d-flex align-items-center justify-content-center p-4" l10nTranslate>Unable to open document</div>
      } @else if (warnOnUnsavedChanges()) {
        <app-files-viewer-unsaved-changes
          [saving]="isSaving()"
          (saveAndExit)="saveAndExit()"
          (closeWithoutSaving)="onClose()"
          (keepEditing)="warnOnUnsavedChanges.set(false)"
        />
      }
      @if (iframeSrc()) {
        <!-- Angular requires a static sandbox; the local frame deliberately keeps an opaque origin. -->
        @if (isExternalEditor()) {
          <iframe
            #editorFrame
            class="drawio-viewer__frame"
            [src]="iframeSrc()"
            title="Draw.io"
            allow="clipboard-read *; clipboard-write *; fullscreen"
            sandbox="allow-downloads allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
            allowfullscreen
          >
          </iframe>
        } @else {
          <iframe
            #editorFrame
            class="drawio-viewer__frame"
            [src]="iframeSrc()"
            title="Draw.io"
            allow="clipboard-read *; clipboard-write *; fullscreen"
            sandbox="allow-downloads allow-forms allow-modals allow-popups allow-scripts"
            allowfullscreen
          >
          </iframe>
        }
      }
    </div>
  `
})
export class FilesViewerDrawioComponent extends FilesViewerEditableBase implements OnInit {
  directoryFiles = input.required<FileModel[]>()
  protected readonly loading = signal(true)
  protected readonly loadFailed = signal(false)
  protected readonly iframeSrc = signal<SafeResourceUrl | null>(null)
  protected readonly isExternalEditor = signal(false)
  private existingFileNames: string[] = []
  private suggestedFileName = ''
  private readonly editorFrame = viewChild<ElementRef<HTMLIFrameElement>>('editorFrame')
  private readonly httpClient = inject(HttpClient)
  private readonly sanitizer = inject(DomSanitizer)
  private readonly filesUploadService = inject(FilesUploadService)
  private readonly store = inject(StoreService)
  private content = ''
  private savedContent = ''
  private editorOrigin = 'null'
  private editorServerUrl = ''
  // draw.io can emit another save while the previous HTTP upload is still running.
  // Coalesce those events into one follow-up upload containing the latest XML.
  private savePending = false
  private closeAfterSave = false
  private closeCheckPending = false
  private initializationMode: DrawioInitializationMode | null = null
  private saveAsModalRef: BsModalRef<FilesViewerSaveAsComponent> | null = null

  // FilesViewerEditableBase has a protected constructor, but Angular components must remain publicly constructible.
  constructor() {
    super()
  }

  ngOnInit() {
    if (this.isImportedFormat()) {
      this.existingFileNames = this.directoryFiles().map((file) => file.name)
      this.suggestedFileName = this.getSuggestedFileName()
    }
    this.httpClient.get<DrawioSettingsDto>(`${API_DRAWIO_SETTINGS}/${this.file().encodedPath}`).subscribe({
      next: (settings) => this.initializeEditor(settings),
      error: (e: HttpErrorResponse) => this.handleLoadError(e)
    })
  }

  @HostListener('window:message', ['$event'])
  onMessage(event: MessageEvent) {
    const frame = this.editorFrame()?.nativeElement
    if (!frame || event.source !== frame.contentWindow || event.origin !== this.editorOrigin) return

    let data: DrawioEditorEvent
    try {
      data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
    } catch {
      return
    }
    if (!data || typeof data.event !== 'string') return

    switch (data.event) {
      case 'ready':
        if (this.isReadonlyView()) {
          this.postToEditor({ action: 'create', data: { type: 'xml', data: this.content } })
        }
        break
      case 'init':
        this.handleInit()
        break
      case 'load':
        this.handleEditorLoad(data)
        break
      case 'save':
        if (typeof data.xml === 'string') this.queueSave(data.xml, data.exit === true)
        break
      case 'autosave':
        if (!this.initializationMode && typeof data.xml === 'string') this.trackChanges(data.xml)
        break
      case 'export':
        this.handleExport(data.xml)
        break
      case 'exit':
        this.requestClose()
        break
    }
  }

  protected currentFileContent(): string {
    return this.content
  }

  protected onContentLoaded(content: string) {
    this.savedContent = content
    this.content = content.trim() ? content : EMPTY_DRAWIO_XML
    this.isModified.set(this.content !== this.savedContent && !this.isReadonly() && this.isWriteable())
    this.initializationMode = !this.isReadonlyView() && !this.isModified() ? 'native' : null
    this.configureIframe()
    if (!this.initializationMode) this.loading.set(false)
  }

  protected override onContentSaved(content: string) {
    this.savedContent = content
    this.postToEditor({ action: 'status', message: '', modified: this.content !== content })
  }

  protected override onContentLoadError(error: HttpErrorResponse) {
    this.handleLoadError(error)
  }

  protected override onSaveFinished(success: boolean) {
    if (!success) {
      // A failed "save and exit" must not close the editor after an unrelated later save.
      this.savePending = false
      this.closeAfterSave = false
      this.postToEditor({ action: 'status', message: 'Save failed.', modified: true })
      return
    }

    if (this.isModified() && (this.savePending || this.closeAfterSave)) {
      // The completed request saved an older snapshot; flush the latest XML before closing.
      this.savePending = false
      this.save()
      return
    }

    this.savePending = false
    if (this.closeAfterSave && !this.isModified()) {
      this.closeAfterSave = false
      this.onClose().catch(console.error)
    }
  }

  protected saveAndExit() {
    this.warnOnUnsavedChanges.set(false)
    if (this.isImportedFormat()) {
      this.openSaveAs()
      return
    }
    this.closeAfterSave = true
    if (this.isSaving()) return
    if (this.isModified()) {
      this.save()
    } else {
      this.closeAfterSave = false
      this.onClose().catch(console.error)
    }
  }

  private configureIframe() {
    const editorUrl = new URL(this.editorServerUrl)
    editorUrl.searchParams.set('dark', this.currentTheme === USER_THEME.DARK ? '1' : '0')
    editorUrl.searchParams.set('lang', this.locale.language)
    if (this.isReadonlyView() && this.initializationMode !== 'import') {
      editorUrl.searchParams.set('chrome', '0')
      editorUrl.searchParams.set('lightbox', '1')
      editorUrl.searchParams.set('layers', '1')
      editorUrl.searchParams.set('nav', '1')
      editorUrl.hash = `create=${encodeURIComponent(JSON.stringify({ type: 'message' }))}`
    } else {
      editorUrl.searchParams.set('embed', '1')
      editorUrl.searchParams.set('spin', '1')
      editorUrl.searchParams.set('proto', 'json')
      editorUrl.searchParams.set('noExitBtn', '1')
    }
    this.iframeSrc.set(this.sanitizer.bypassSecurityTrustResourceUrl(editorUrl.toString()))
  }

  private isReadonlyView(): boolean {
    return this.isReadonly() || !this.isWriteable()
  }

  private queueSave(xml: string, exit: boolean) {
    if (this.isReadonlyView()) return
    this.trackChanges(xml)
    if (this.isImportedFormat()) {
      this.openSaveAs()
      return
    }
    this.closeAfterSave ||= exit
    if (this.isSaving()) {
      this.savePending = true
      return
    }
    if (this.isModified()) {
      this.save()
    } else if (this.closeAfterSave) {
      this.closeAfterSave = false
      this.onClose().catch(console.error)
    }
  }

  private trackChanges(xml: string) {
    if (this.isReadonlyView()) return
    this.content = xml
    this.isModified.set(this.content !== this.savedContent)
  }

  protected override requestClose() {
    if (this.isSaving() || this.closeCheckPending || this.saveAsModalRef) return
    if (this.loading() || this.isReadonlyView()) {
      super.requestClose()
      return
    }
    this.closeCheckPending = true
    // Flush the active cell editor before exporting; autosave may not contain the latest keystrokes yet.
    this.postToEditor({ action: 'resetEditor' })
    this.postToEditor({ action: 'export', format: 'xml' })
  }

  protected override usesFileLock(): boolean {
    return !this.isImportedFormat()
  }

  private saveImportedFile(baseName: string) {
    if (!this.isImportedFormat() || this.isSaving()) return
    const fileName = `${baseName}.drawio`
    try {
      isValidFileName(fileName)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : `${e}`
      this.saveAsModalRef?.content?.setError(`${this.layout.translateString(message)} : ${forbiddenChars}`)
      return
    }
    if (new Blob([this.content]).size >= MAX_CLIENT_EDITOR_FILE_SIZE) {
      this.saveAsModalRef?.content?.setError(this.layout.translateString('File size limit exceeded'))
      return
    }

    const directoryPath = this.file().path.split('/').slice(0, -1).join('/') || '.'
    this.isSaving.set(true)
    this.saveAsModalRef?.content?.setSaving(true)
    this.saveAsModalRef?.content?.setError('')
    this.filesUploadService.uploadNewFileContent(directoryPath, fileName, this.content).subscribe({
      next: () => {
        this.isSaving.set(false)
        this.isModified.set(false)
        if (this.saveAsModalRef?.id != null) this.layout.closeDialog(null, this.saveAsModalRef.id)
        this.onClose()
          .then(() => this.store.filesOnEvent.next({ filePath: directoryPath, fileName, focus: true, reload: true, openAfterCreate: true }))
          .catch(console.error)
      },
      error: (e: HttpErrorResponse) => {
        this.isSaving.set(false)
        this.saveAsModalRef?.content?.setSaving(false)
        this.saveAsModalRef?.content?.setError(
          e.status === 405 ? this.layout.translateString('This name is already used') : e.error?.message || e.message
        )
      }
    })
  }

  private async loadImportedContent() {
    const extension = this.file().getExtension()
    if (extension === 'vsdx') {
      const content = await firstValueFrom(this.httpClient.get(this.file().dataUrl, { responseType: 'arraybuffer' }))
      this.content = await this.toDataUrl(content, 'application/vnd.visio')
    } else {
      this.content = await firstValueFrom(this.httpClient.get(this.file().dataUrl, { responseType: 'text' }))
    }
    this.initializationMode = 'import'
    this.configureIframe()
  }

  private completeInitialization(xml: string) {
    const initializationMode = this.initializationMode
    if (!initializationMode) return
    this.initializationMode = null
    this.content = xml
    this.savedContent = xml
    this.isModified.set(false)
    if (initializationMode === 'import') {
      this.postToEditor({ action: 'status', message: '', modified: false })
      // Conversion requires embed mode first; only then can a read-only import switch to the viewer.
      if (this.isReadonlyView()) this.configureIframe()
    }
    this.loading.set(false)
  }

  private handleInit() {
    if (this.isReadonlyView() && this.initializationMode !== 'import') return
    this.postToEditor({ action: 'load', xml: this.content, autosave: 1 })
    if (this.initializationMode !== 'import' && this.isModified()) this.save()
  }

  private handleEditorLoad(data: DrawioEditorEvent) {
    if (data.error) {
      this.handleLoadError(data.message || data.error)
    } else if (this.initializationMode) {
      this.postToEditor({ action: 'export', format: 'xml' })
    }
  }

  private handleExport(xml: string | undefined) {
    if (typeof xml !== 'string') return
    if (this.initializationMode) {
      this.completeInitialization(xml)
      return
    }
    if (!this.closeCheckPending) return
    this.closeCheckPending = false
    this.trackChanges(xml)
    super.requestClose()
  }

  private openSaveAs() {
    if (this.saveAsModalRef) return
    this.warnOnUnsavedChanges.set(false)
    const modalRef: BsModalRef<FilesViewerSaveAsComponent> = this.layout.openDialog(
      FilesViewerSaveAsComponent,
      'sm',
      {
        initialState: {
          existingNames: this.existingFileNames,
          suggestedName: this.suggestedFileName
        } satisfies Partial<FilesViewerSaveAsComponent>
      },
      { keyboard: false }
    )
    this.saveAsModalRef = modalRef
    const confirmSubscription = modalRef.content!.confirmSave.subscribe((baseName: string) => this.saveImportedFile(baseName))
    modalRef.onHidden?.pipe(take(1)).subscribe(() => {
      confirmSubscription.unsubscribe()
      if (this.saveAsModalRef !== modalRef) return
      this.saveAsModalRef = null
      this.postToEditor({ action: 'status', message: '', modified: this.isModified() })
    })
  }

  private getSuggestedFileName(): string {
    const sourceName = this.file().name
    const extensionIndex = sourceName.lastIndexOf('.')
    const baseName = extensionIndex > 0 ? sourceName.slice(0, extensionIndex) : sourceName
    const existingNames = new Set(this.existingFileNames.map((name) => name.normalize().toLowerCase()))
    let candidate = baseName
    let suffix = 1
    while (existingNames.has(`${candidate}.drawio`.normalize().toLowerCase())) {
      candidate = `${baseName} (${suffix++})`
    }
    return candidate
  }

  private isImportedFormat(): boolean {
    return DRAWIO_IMPORT_EXTENSIONS.has(this.file().getExtension())
  }

  private toDataUrl(content: ArrayBuffer, mime: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(new Blob([content], { type: mime }))
    })
  }

  private postToEditor(message: object) {
    // The sandboxed local editor has an opaque origin ("null"), so postMessage cannot target its HTTP origin.
    const targetOrigin = this.editorOrigin === 'null' ? '*' : this.editorOrigin
    this.editorFrame()?.nativeElement.contentWindow?.postMessage(JSON.stringify(message), targetOrigin)
  }

  private handleLoadError(error: unknown) {
    this.initializationMode = null
    this.closeCheckPending = false
    this.loading.set(false)
    this.loadFailed.set(true)
    const message = error instanceof HttpErrorResponse ? error.error?.message || error.message : `${error}`
    this.layout.sendNotification('error', 'Unable to open document', message)
  }

  private initializeEditor(settings: DrawioSettingsDto) {
    try {
      const editorUrl = new URL(settings.documentServerUrl)
      if (editorUrl.protocol !== 'http:' && editorUrl.protocol !== 'https:') throw new Error('Unsupported draw.io URL')
      this.editorServerUrl = editorUrl.toString()
      if (editorUrl.origin !== window.location.origin) {
        this.editorOrigin = editorUrl.origin
        this.isExternalEditor.set(true)
      }
      this.isSupported.set(true)
      if (this.isImportedFormat()) {
        this.loadImportedContent().catch((e) => this.handleLoadError(e))
      } else {
        this.loadContent().catch(console.error)
      }
    } catch (e) {
      this.handleLoadError(e)
    }
  }
}
