import { HttpClient, HttpErrorResponse } from '@angular/common/http'
import { Directive, effect, inject, input, model, OnDestroy, signal, untracked } from '@angular/core'
import type { FileLockProps } from '@sync-in-server/backend/src/applications/files/interfaces/file-props.interface'
import { L10N_LOCALE, L10nLocale } from 'angular-l10n'
import { firstValueFrom } from 'rxjs'
import { type AppWindow, themeDark } from '../../../../layout/layout.interfaces'
import { LayoutService } from '../../../../layout/layout.service'
import { FileModel } from '../../models/file.model'
import { FilesService } from '../../services/files.service'
import { FilesUploadService } from '../../services/files-upload.service'
import { fileLockPropsToString } from '../utils/file-lock.utils'

@Directive()
export abstract class FilesViewerEditableBase implements OnDestroy {
  currentHeight = input.required<number>()
  file = model.required<FileModel>()
  isWriteable = input.required<boolean>()
  isReadonly = model.required<boolean>()
  modalClosing = input.required<boolean>()
  protected isSupported = signal(false)
  protected isModified = signal(false)
  protected isSaving = signal(false)
  protected warnOnUnsavedChanges = signal(false)
  protected currentTheme: 'dark' | 'light' = 'light'
  protected readonly layout = inject(LayoutService)
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  private readonly http = inject(HttpClient)
  private readonly filesServices = inject(FilesService)
  private readonly filesUpload = inject(FilesUploadService)
  private readonly subscription = this.layout.switchTheme.subscribe((layout: string) => (this.currentTheme = layout === themeDark ? 'dark' : 'light'))
  private isDestroyed = false
  private unlockRequested = false

  protected constructor() {
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
  }

  ngOnDestroy() {
    this.subscription.unsubscribe()
    this.isDestroyed = true
    // Fallback for programmatic closes that bypass onClose().
    if (!this.isReadonly() && this.file().lock) {
      void this.unlockFile()
    }
  }

  protected abstract currentFileContent(): string

  protected abstract onContentLoaded(content: string): void

  protected onContentSaved(_content: string): void {
    return
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
    const content = this.currentFileContent()
    this.filesUpload.uploadOneFile(this.file(), content, true).subscribe({
      next: () => {
        this.onContentSaved(content)
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

  protected canEditContent(): boolean {
    return !this.isReadonly() && this.isWriteable()
  }

  protected async onClose() {
    if (!this.isReadonly()) {
      await this.unlockFile()
    }
    this.layout.closeDialog(null, this.file().id)
  }

  protected async loadContent() {
    if (!this.isReadonly()) {
      await this.lockFile()
    }
    this.http.get(this.file().dataUrl, { responseType: 'text' }).subscribe({
      next: (data: string) => this.onContentLoaded(data),
      error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Unable to open document', this.file().name, e)
    })
  }

  protected async lockFile(): Promise<boolean> {
    if (!this.isSupported() || !this.isWriteable()) return false
    try {
      const lock: FileLockProps = await firstValueFrom(this.filesServices.lock(this.file()))
      this.unlockRequested = false
      this.file.update((f) => {
        f.lock = lock
        return f
      })
      if (this.isDestroyed) {
        await this.unlockFile()
        return false
      }
      return true
    } catch (e) {
      this.lockError(e as HttpErrorResponse)
      return false
    }
  }

  protected async unlockFile() {
    if (this.unlockRequested || !this.isSupported() || !this.isWriteable()) return
    this.unlockRequested = true
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
