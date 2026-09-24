import { HttpClient, HttpErrorResponse } from '@angular/common/http'
import { Component, ElementRef, HostListener, inject, OnDestroy, OnInit, signal, viewChild } from '@angular/core'
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser'
import type { DrawioSettingsDto } from '@sync-in-server/backend/src/applications/files/editors/drawio/drawio.dtos'
import { EMPTY_DRAWIO_XML } from '@sync-in-server/backend/src/applications/files/editors/drawio/drawio.constants'
import { API_DRAWIO_SETTINGS } from '@sync-in-server/backend/src/applications/files/editors/drawio/drawio.routes'
import { L10nTranslateDirective } from 'angular-l10n'
import { FilesViewerUnsavedChangesComponent } from './components/files-viewer-unsaved-changes.component'
import { FilesViewerEditableBase } from './files-viewer-editable-base'
import type { DrawioEditorEvent } from './interfaces/files-viewer-drawio.interface'

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
        height: 100%;
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
      } @else if (iframeSrc()) {
        @if (warnOnUnsavedChanges()) {
          <app-files-viewer-unsaved-changes
            [saving]="isSaving()"
            (saveAndExit)="saveAndExit()"
            (closeWithoutSaving)="onClose()"
            (keepEditing)="warnOnUnsavedChanges.set(false)"
          />
        }
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
export class FilesViewerDrawioComponent extends FilesViewerEditableBase implements OnInit, OnDestroy {
  protected readonly loading = signal(true)
  protected readonly loadFailed = signal(false)
  protected readonly iframeSrc = signal<SafeResourceUrl | null>(null)
  protected readonly isExternalEditor = signal(false)
  private readonly editorFrame = viewChild<ElementRef<HTMLIFrameElement>>('editorFrame')
  private readonly httpClient = inject(HttpClient)
  private readonly sanitizer = inject(DomSanitizer)
  private content = ''
  private savedContent = ''
  private editorOrigin = 'null'
  private editorServerUrl = ''
  // draw.io can emit another save while the previous HTTP upload is still running.
  // Coalesce those events into one follow-up upload containing the latest XML.
  private savePending = false
  private closeAfterSave = false

  constructor() {
    super()
  }

  ngOnInit() {
    this.httpClient.get<DrawioSettingsDto>(`${API_DRAWIO_SETTINGS}/${this.file().encodedPath}`).subscribe({
      next: (settings) => {
        try {
          const editorUrl = new URL(settings.documentServerUrl)
          if (editorUrl.protocol !== 'http:' && editorUrl.protocol !== 'https:') throw new Error('Unsupported draw.io URL')
          this.editorServerUrl = editorUrl.toString()
          if (editorUrl.origin !== window.location.origin) {
            this.editorOrigin = editorUrl.origin
            this.isExternalEditor.set(true)
          }
          this.isSupported.set(true)
          this.loadContent().catch(console.error)
        } catch (e) {
          this.handleLoadError(e)
        }
      },
      error: (e: HttpErrorResponse) => this.handleLoadError(e)
    })
  }

  override ngOnDestroy() {
    super.ngOnDestroy()
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
        if (this.isReadonlyView()) return
        this.postToEditor({ action: 'load', xml: this.content, autosave: 1, title: this.file().name })
        if (this.isModified()) this.persist()
        break
      case 'save':
        if (typeof data.xml === 'string') this.queueSave(data.xml, data.exit === true)
        break
      case 'autosave':
        if (typeof data.xml === 'string') this.trackChanges(data.xml)
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
    this.configureIframe()
    this.loading.set(false)
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
      this.persist()
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
    this.closeAfterSave = true
    if (this.isSaving()) return
    if (this.isModified()) {
      this.persist()
    } else {
      this.closeAfterSave = false
      this.onClose().catch(console.error)
    }
  }

  private configureIframe() {
    const editorUrl = new URL(this.editorServerUrl)
    editorUrl.searchParams.set('dark', this.currentTheme === 'dark' ? '1' : '0')
    editorUrl.searchParams.set('lang', this.locale.language)
    if (this.isReadonlyView()) {
      editorUrl.searchParams.set('chrome', '0')
      editorUrl.searchParams.set('lightbox', '1')
      editorUrl.searchParams.set('layers', '1')
      editorUrl.searchParams.set('nav', '1')
      editorUrl.searchParams.set('title', this.file().name)
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
    if (this.isReadonly() || !this.isWriteable()) return
    this.trackChanges(xml)
    this.closeAfterSave ||= exit
    if (this.isSaving()) {
      this.savePending = true
      return
    }
    if (this.isModified()) {
      this.persist()
    } else if (this.closeAfterSave) {
      this.closeAfterSave = false
      this.onClose().catch(console.error)
    }
  }

  private trackChanges(xml: string) {
    if (this.isReadonly() || !this.isWriteable()) return
    this.content = xml
    this.isModified.set(this.content !== this.savedContent)
  }

  private requestClose() {
    if (this.isSaving()) return
    if (this.isModified() && !this.isReadonly()) {
      this.warnOnUnsavedChanges.set(true)
    } else {
      this.onClose().catch(console.error)
    }
  }

  private persist() {
    this.save()
  }

  private postToEditor(message: object) {
    const targetOrigin = this.editorOrigin === 'null' ? '*' : this.editorOrigin
    this.editorFrame()?.nativeElement.contentWindow?.postMessage(JSON.stringify(message), targetOrigin)
  }

  private handleLoadError(error: unknown) {
    this.loading.set(false)
    this.loadFailed.set(true)
    const message = error instanceof HttpErrorResponse ? error.error?.message || error.message : `${error}`
    this.layout.sendNotification('error', 'Unable to open document', message)
  }
}
