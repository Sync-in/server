import { HttpClient, HttpErrorResponse } from '@angular/common/http'
import {
  AfterViewInit,
  Directive,
  effect,
  HostListener,
  inject,
  input,
  model,
  OnDestroy,
  output,
  signal,
  untracked,
  viewChildren
} from '@angular/core'
import { CACHE_LOCK_FILE_TTL } from '@sync-in-server/backend/src/applications/files/constants/cache'
import type { FileLockProps } from '@sync-in-server/backend/src/applications/files/interfaces/file-props.interface'
import { L10N_LOCALE, L10nLocale } from 'angular-l10n'
import { TooltipDirective } from 'ngx-bootstrap/tooltip'
import { catchError, EMPTY, exhaustMap, filter, firstValueFrom, Subscription, tap, timer } from 'rxjs'
import { type AppWindow, themeDark } from '../../../../layout/layout.interfaces'
import { LayoutService } from '../../../../layout/layout.service'
import { MAX_CLIENT_EDITOR_FILE_SIZE } from '../../files.constants'
import { FileModel } from '../../models/file.model'
import { FilesService } from '../../services/files.service'
import { FilesUploadService } from '../../services/files-upload.service'
import { fileLockPropsToString } from '../utils/file-lock.utils'

const LOCK_REFRESH_INTERVAL_MS = (CACHE_LOCK_FILE_TTL * 1_000) / 6
const HTTP_STATUS_LOCKED = 423

@Directive()
export abstract class FilesViewerEditableBase implements AfterViewInit, OnDestroy {
  currentHeight = input.required<number>()
  file = model.required<FileModel>()
  isWriteable = input.required<boolean>()
  isReadonly = model.required<boolean>()
  modalClosing = input.required<boolean>()
  readonly viewerReady = output<void>()
  protected isSupported = signal(false)
  protected isModified = signal(false)
  protected isSaving = signal(false)
  protected warnOnUnsavedChanges = signal(false)
  protected currentTheme: 'dark' | 'light' = 'light'
  protected readonly layout = inject(LayoutService)
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  private readonly tooltips = viewChildren(TooltipDirective)
  private readonly http = inject(HttpClient)
  private readonly filesServices = inject(FilesService)
  private readonly filesUpload = inject(FilesUploadService)
  private readonly themeSubscription = this.layout.switchTheme.subscribe(
    (layout: string) => (this.currentTheme = layout === themeDark ? 'dark' : 'light')
  )
  private lockRefreshSubscription: Subscription | null = null
  private lockRefreshWarningSent = false
  private isDestroyed = false
  private unlockPromise: Promise<boolean> | null = null

  protected constructor() {
    effect(() => {
      if (!this.modalClosing()) return
      untracked(() => this.requestClose())
    })
  }

  ngAfterViewInit() {
    this.viewerReady.emit()
  }

  ngOnDestroy() {
    this.themeSubscription.unsubscribe()
    this.stopLockRefresh()
    this.isDestroyed = true
    // Fallback for programmatic closes that bypass onClose().
    if (this.usesFileLock() && !this.isReadonly() && this.file().lock) {
      void this.unlockFile()
    }
  }

  @HostListener('window:pagehide', ['$event'])
  protected onPageHide(event: PageTransitionEvent) {
    if (!event.persisted) {
      this.unlockFileOnPageUnload()
    }
  }

  protected abstract currentFileContent(): string

  protected abstract onContentLoaded(content: string): void

  protected onContentSaved(_content: string): void {
    return
  }

  protected onContentLoadError(e: HttpErrorResponse): void {
    this.layout.sendNotification('error', 'Unable to open document', this.file().name, e)
  }

  protected onSaveFinished(_success: boolean): void {
    return
  }

  protected async toggleReadonly() {
    if (this.isReadonly()) {
      if (await this.lockFile()) {
        this.isReadonly.set(false)
      }
    } else {
      if (await this.unlockFile()) {
        this.isReadonly.set(true)
      }
    }
  }

  protected save(exit = false) {
    if (!this.canSave()) return
    const content = this.currentFileContent()
    const contentSize = new Blob([content]).size
    if (contentSize >= MAX_CLIENT_EDITOR_FILE_SIZE) {
      this.onSaveFinished(false)
      this.layout.sendNotification('warning', 'Unable to save document', 'File size limit exceeded')
      return
    }
    this.isSaving.set(true)
    this.filesUpload.uploadFileContent(this.file(), content, true).subscribe({
      next: () => {
        if (this.isDestroyed) return
        this.onContentSaved(content)
        // The editor may have changed while this content snapshot was uploading.
        // Only mark it clean when the current content still matches that snapshot.
        this.isModified.set(this.currentFileContent() !== content)
        this.isSaving.set(false)
        this.warnOnUnsavedChanges.set(false)
        if (exit && !this.isModified()) {
          this.onClose().catch(console.error)
        } else {
          this.onSaveFinished(true)
        }
        this.file().updateSize(contentSize)
        this.file().updateHTimeAgo()
      },
      error: (e: HttpErrorResponse) => {
        if (this.isDestroyed) return
        this.isSaving.set(false)
        this.onSaveFinished(false)
        this.layout.sendNotification('error', 'Unable to save document', e.error.message)
      }
    })
  }

  protected canSave(): boolean {
    return this.canEditContent() && this.isModified()
  }

  protected canEditContent(): boolean {
    return !this.isReadonly() && this.isWriteable() && !this.isSaving()
  }

  protected canRestoreEditorFocus(): boolean {
    return !document.activeElement?.closest('.files-viewer-search')
  }

  protected usesFileLock(): boolean {
    return true
  }

  protected requestClose(): void {
    const fileId = this.file().id
    if (this.isModified()) {
      this.warnOnUnsavedChanges.set(true)
      if (this.layout.windows.getValue().find((w: AppWindow) => w.id === fileId)) {
        this.layout.restoreDialog(fileId)
      }
    } else {
      this.onClose().catch(console.error)
    }
  }

  protected hideTooltips(): void {
    this.tooltips().forEach((tooltip: TooltipDirective) => tooltip.hide())
  }

  protected isActiveDialog(): boolean {
    return this.layout.isDialogActive(this.file().id)
  }

  protected async onClose() {
    if (this.isSaving()) return
    if (this.usesFileLock() && !this.isReadonly() && !(await this.unlockFile())) return
    this.layout.closeDialog(null, this.file().id)
  }

  protected async loadContent() {
    if (!this.isReadonly()) {
      await this.lockFile()
    }
    this.http.get(this.file().dataUrl, { responseType: 'text' }).subscribe({
      next: (data: string) => this.onContentLoaded(data),
      error: (e: HttpErrorResponse) => this.onContentLoadError(e)
    })
  }

  protected async lockFile(): Promise<boolean> {
    if (!this.isSupported() || !this.isWriteable()) return false
    try {
      const lock: FileLockProps = await firstValueFrom(this.filesServices.lock(this.file()))
      this.file.update((f) => {
        f.lock = lock
        return f
      })
      if (this.isDestroyed) {
        await this.unlockFile()
        return false
      }
      this.startLockRefresh()
      return true
    } catch (e) {
      this.lockError(e as HttpErrorResponse)
      return false
    }
  }

  protected unlockFile(): Promise<boolean> {
    this.stopLockRefresh()
    if (!this.file().lock) return Promise.resolve(true)
    // Close, toggle and destroy paths must await the same request instead of racing each other.
    if (this.unlockPromise) return this.unlockPromise

    this.unlockPromise = this.releaseLock()
      .then((success) => {
        if (!success && !this.isDestroyed && !this.isReadonly()) this.startLockRefresh()
        return success
      })
      .finally(() => {
        this.unlockPromise = null
      })
    return this.unlockPromise
  }

  private startLockRefresh() {
    if (this.lockRefreshSubscription || this.isDestroyed || !this.isWriteable() || !this.file().lock) return
    this.lockRefreshWarningSent = false
    this.lockRefreshSubscription = timer(LOCK_REFRESH_INTERVAL_MS, LOCK_REFRESH_INTERVAL_MS)
      .pipe(
        filter(() => !this.isReadonly() && this.isWriteable() && !!this.file().lock),
        exhaustMap(() =>
          this.filesServices.lock(this.file()).pipe(
            tap((lock: FileLockProps) => {
              this.lockRefreshWarningSent = false
              this.file.update((file) => {
                file.lock = lock
                return file
              })
            }),
            catchError((e: HttpErrorResponse) => {
              this.handleLockRefreshError(e)
              return EMPTY
            })
          )
        )
      )
      .subscribe()
  }

  private stopLockRefresh() {
    this.lockRefreshSubscription?.unsubscribe()
    this.lockRefreshSubscription = null
  }

  private handleLockRefreshError(e: HttpErrorResponse) {
    if (e.status === HTTP_STATUS_LOCKED) {
      this.stopLockRefresh()
      this.lockError(e)
      return
    }
    if (!this.lockRefreshWarningSent) {
      this.lockRefreshWarningSent = true
      this.layout.sendNotification('warning', this.file().name, 'Service unavailable', e)
    }
  }

  private async releaseLock(): Promise<boolean> {
    try {
      await firstValueFrom(this.filesServices.unlock(this.file()))
      this.file.update((f) => {
        delete f.lock
        return f
      })
      return true
    } catch (e) {
      // Keep the local lock and the editor state intact so a later close or toggle can retry.
      this.layout.sendNotification('warning', 'Unable to unlock file', this.file().name, e as HttpErrorResponse)
      return false
    }
  }

  private unlockFileOnPageUnload() {
    // Firefox may cancel this request when closing the tab before it reaches the backend.
    if (this.isReadonly() || !this.file().lock) return
    // Reuse an existing unlock promise so destruction cannot start a competing request.
    void this.unlockFile()
  }

  private lockError(e: HttpErrorResponse) {
    this.stopLockRefresh()
    // Lock availability is independent from editor support: keep the viewer read-only and retryable.
    this.isReadonly.set(true)
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
