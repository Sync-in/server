import { HttpErrorResponse } from '@angular/common/http'
import { Component, ElementRef, HostListener, inject, OnInit, signal, viewChild } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser'
import { L10nTranslateDirective } from 'angular-l10n'
import { StoreService } from '../../../../store/store.service'
import { MAX_CLIENT_EDITOR_FILE_SIZE } from '../../files.constants'
import { FilesUploadService } from '../../services/files-upload.service'
import { PhotopeaFormatsService } from '../../services/photopea-formats.service'
import { FilesViewerUnsavedChangesComponent } from './components/files-viewer-unsaved-changes.component'
import { FilesViewerEditableBase } from './files-viewer-editable-base'

@Component({
  selector: 'app-files-viewer-photopea',
  imports: [L10nTranslateDirective, FilesViewerUnsavedChangesComponent],
  styles: [
    `
      .photopea-viewer {
        position: relative;
      }

      .photopea-viewer__frame {
        width: 100%;
        border: 0;
      }

      .photopea-viewer__state {
        position: absolute;
        z-index: 1;
        inset: 0;
        background: var(--bs-body-bg);
      }
    `
  ],
  template: `
    <div class="photopea-viewer" [style.height.px]="currentHeight()">
      @if (loading()) {
        <div class="photopea-viewer__state d-flex align-items-center justify-content-center" role="status">
          <span class="spinner-border text-primary" aria-hidden="true"></span>
          <span class="visually-hidden" l10nTranslate>Loading...</span>
        </div>
      } @else if (loadFailed()) {
        <div class="photopea-viewer__state d-flex align-items-center justify-content-center p-4" l10nTranslate>Unable to open document</div>
      }
      @if (iframeSrc()) {
        <iframe
          #editorFrame
          class="photopea-viewer__frame"
          [style.height.px]="currentHeight()"
          [src]="iframeSrc()"
          title="Photopea image editor"
          allow="clipboard-read *; clipboard-write *; fullscreen"
          sandbox="allow-downloads allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
          allowfullscreen
        ></iframe>
      }
      @if (loaded() && lockReady() && isWriteable() && !isReadonly()) {
        <div class="position-absolute top-0 end-0 p-2">
          <button (click)="save()" [disabled]="isSaving()" class="btn btn-primary" type="button">
            @if (isSaving()) {
              <span l10nTranslate>Saving...</span>
            } @else {
              <span l10nTranslate>Save</span>
            }
          </button>
        </div>
      }
      @if (warnOnUnsavedChanges()) {
        <app-files-viewer-unsaved-changes
          [saving]="isSaving()"
          (saveAndExit)="saveAndExit()"
          (closeWithoutSaving)="onClose()"
          (keepEditing)="warnOnUnsavedChanges.set(false)"
        />
      }
    </div>
  `
})
export class FilesViewerPhotopeaComponent extends FilesViewerEditableBase implements OnInit {
  protected readonly loading = signal(true)
  protected readonly loadFailed = signal(false)
  protected readonly loaded = signal(false)
  protected readonly lockReady = signal(false)
  protected readonly iframeSrc = signal<SafeResourceUrl | null>(null)
  private readonly editorFrame = viewChild<ElementRef<HTMLIFrameElement>>('editorFrame')
  private readonly sanitizer = inject(DomSanitizer)
  private readonly store = inject(StoreService)
  private readonly photopeaUpload = inject(FilesUploadService)
  private readonly photopeaFormats = inject(PhotopeaFormatsService)
  private editorOrigin = ''
  private originalContent: ArrayBuffer | null = null
  private initializationReceived = false
  private awaitingFileLoad = false
  private awaitingSave = false
  private closeAfterSave = false
  private saveTimeout: ReturnType<typeof setTimeout> | null = null

  constructor() {
    super()
  }

  ngOnInit() {
    const externalServer = this.store.server().files.photopeaExternalServer
    if (!externalServer || !this.photopeaFormats.canOpenWithPhotopea(this.file().getExtension())) {
      this.failToLoad(new Error('Photopea is not configured for this file'))
      return
    }

    this.editorOrigin = new URL(externalServer).origin
    this.iframeSrc.set(this.sanitizer.bypassSecurityTrustResourceUrl(externalServer))
    this.isSupported.set(true)
    if (this.isReadonly()) {
      this.lockReady.set(true)
    } else {
      void this.lockFile().finally(() => this.lockReady.set(true))
    }
    this.http
      .get(this.file().dataUrl, { responseType: 'arraybuffer' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (content) => {
          if (content.byteLength > MAX_CLIENT_EDITOR_FILE_SIZE) {
            this.failToLoad(new Error('File size limit exceeded'))
            return
          }
          this.originalContent = content
          this.loading.set(false)
          this.loadPhotopeaFileWhenReady()
        },
        error: (e: HttpErrorResponse) => this.failToLoad(e)
      })
  }

  @HostListener('window:message', ['$event'])
  onMessage(event: MessageEvent) {
    const frame = this.editorFrame()?.nativeElement
    if (!frame || event.source !== frame.contentWindow || event.origin !== this.editorOrigin) return

    if (event.data instanceof ArrayBuffer) {
      if (this.awaitingSave) this.saveToSyncIn(event.data)
      return
    }
    if (event.data !== 'done') return

    if (!this.initializationReceived) {
      this.initializationReceived = true
      this.loadPhotopeaFileWhenReady()
    } else if (this.awaitingFileLoad) {
      this.awaitingFileLoad = false
      this.loaded.set(true)
      this.postToPhotopea(`app.activeDocument.name = ${JSON.stringify(this.file().name)};`)
      if (!this.isReadonly() && this.isWriteable()) this.isModified.set(true)
    }
  }

  protected currentFileContent(): string {
    return ''
  }

  protected onContentLoaded(_content: string): void {
    return
  }

  protected override requestClose() {
    if (this.isSaving()) return
    if (this.loaded() && !this.isReadonly() && this.isWriteable()) {
      this.warnOnUnsavedChanges.set(true)
    } else {
      this.onClose().catch(console.error)
    }
  }

  protected saveAndExit() {
    this.closeAfterSave = true
    this.save(true)
  }

  protected override save(exit = false) {
    if (!this.loaded() || !this.lockReady() || this.isReadonly() || !this.isWriteable() || this.isSaving()) return
    this.closeAfterSave ||= exit
    const format = this.photopeaFormats.getSaveFormat(this.file().getExtension())
    if (!format) {
      this.layout.sendNotification('error', 'Unable to save document', 'Unsupported image format')
      return
    }
    this.isSaving.set(true)
    this.awaitingSave = true
    this.saveTimeout = setTimeout(() => {
      this.awaitingSave = false
      this.finishSave(false, new Error('Photopea did not return the saved image'))
    }, 120_000)
    this.postToPhotopea(`app.activeDocument.saveToOE(${JSON.stringify(format)});`)
  }

  override ngOnDestroy() {
    if (this.saveTimeout) clearTimeout(this.saveTimeout)
    super.ngOnDestroy()
  }

  private loadPhotopeaFileWhenReady() {
    const frame = this.editorFrame()?.nativeElement
    if (!this.initializationReceived || !frame?.contentWindow || !this.originalContent || this.awaitingFileLoad) return
    this.awaitingFileLoad = true
    frame.contentWindow.postMessage(this.originalContent, this.editorOrigin, [this.originalContent])
    this.originalContent = null
  }

  private postToPhotopea(script: string) {
    this.editorFrame()?.nativeElement.contentWindow?.postMessage(script, this.editorOrigin)
  }

  private saveToSyncIn(content: ArrayBuffer) {
    this.awaitingSave = false
    if (content.byteLength > MAX_CLIENT_EDITOR_FILE_SIZE) {
      this.finishSave(false, new Error('File size limit exceeded'))
      return
    }
    const mimeType = this.file().mime.replace('-', '/')
    this.photopeaUpload
      .uploadFileBlob(this.file(), new Blob([content], { type: mimeType }))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.finishSave(true, undefined, content.byteLength),
        error: (e: HttpErrorResponse) => this.finishSave(false, e)
      })
  }

  private finishSave(success: boolean, error?: Error | HttpErrorResponse, size?: number) {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout)
      this.saveTimeout = null
    }
    this.isSaving.set(false)
    if (!success) {
      this.closeAfterSave = false
      this.layout.sendNotification('error', 'Unable to save document', error?.message || this.file().name)
      return
    }

    if (size !== undefined) this.file().updateSize(size)
    this.file().updateHTimeAgo()
    this.fileChange.emit(this.file())
    if (this.closeAfterSave) {
      this.closeAfterSave = false
      this.isModified.set(false)
      this.onClose().catch(console.error)
    } else {
      this.layout.sendNotification('info', 'File saved', this.file().name)
    }
  }

  private failToLoad(error: Error | HttpErrorResponse) {
    this.loading.set(false)
    this.loadFailed.set(true)
    this.layout.sendNotification('error', 'Unable to open document', this.file().name, error instanceof HttpErrorResponse ? error : undefined)
  }
}
