import { HttpClient, HttpErrorResponse } from '@angular/common/http'
import { Component, ElementRef, inject, input, model, OnDestroy, OnInit, ViewChild } from '@angular/core'
import { FILE_MODE } from '@sync-in-server/backend/src/applications/files/constants/operations'
import { COLLABORA_APP_LOCK } from '@sync-in-server/backend/src/applications/files/editors/collabora-online/collabora-online.constants'
import type { CollaboraOnlineReqDto } from '@sync-in-server/backend/src/applications/files/editors/collabora-online/collabora-online.dtos'
import { API_COLLABORA_ONLINE_SETTINGS } from '@sync-in-server/backend/src/applications/files/editors/collabora-online/collabora-online.routes'
import { LayoutService } from '../../../../layout/layout.service'
import { StoreService } from '../../../../store/store.service'
import { FileModel } from '../../models/file.model'
import { FilesService } from '../../services/files.service'
import { fileLockPropsToString } from '../utils/file-lock.utils'

@Component({
  selector: 'app-files-viewer-collabora-online',
  template: `
    @if (documentServerUrl) {
      <div class="app-collabora-online-border" [style.height.px]="currentHeight()">
        <iframe [attr.name]="frameName" class="app-viewer-iframe collabora-scaling" allow="clipboard-read *; clipboard-write *; fullscreen"></iframe>
        <form #documentForm [action]="documentServerUrl" method="post" [attr.target]="frameName" hidden>
          <input type="hidden" name="ui_defaults" [value]="collaboraUiDefaults" />
        </form>
      </div>
    }
  `,
  styles: [
    `
      .collabora-scaling {
        transform: scale(0.9);
        transform-origin: 0 0;
        width: calc(100% / 0.9);
        height: calc(100% / 0.9);
      }
    `
  ]
})
export class FilesViewerCollaboraOnlineComponent implements OnInit, OnDestroy {
  file = input.required<FileModel>()
  isReadonly = model.required<boolean>()
  currentHeight = input<number>()
  protected documentServerUrl: string = null
  protected frameName: string
  protected collaboraUiDefaults: string
  private readonly http = inject(HttpClient)
  private readonly filesService = inject(FilesService)
  private readonly layout = inject(LayoutService)
  private readonly store = inject(StoreService)
  private shouldReconcileMetadata = false

  @ViewChild('documentForm')
  private set documentForm(form: ElementRef<HTMLFormElement> | undefined) {
    form?.nativeElement.submit()
  }

  ngOnInit() {
    this.frameName = `collabora-frame-${this.file().id}`
    this.http.get<CollaboraOnlineReqDto>(`${API_COLLABORA_ONLINE_SETTINGS}/${this.file().path}`).subscribe({
      next: (data) => {
        if (!data) {
          this.layout.closeDialog()
          this.layout.sendNotification('error', 'Unable to open document', 'Settings are missing')
          return
        }
        if (data.hasLock) {
          if (!this.file().lock) {
            this.file().createLock(data.hasLock)
          } else if (!this.file().lock.isExclusive) {
            // If a lock already exists and is exclusive, a notification was previously fired
            this.layout.sendNotification('info', 'The file is locked', fileLockPropsToString(data.hasLock))
          }
        }
        this.isReadonly.set(data.mode === FILE_MODE.VIEW)
        this.shouldReconcileMetadata = !this.isReadonly()
        if (!this.isReadonly() && !this.file().lock) {
          // Set lock on file
          this.file().createLock({
            owner: {
              login: this.store.user.getValue().login,
              fullName: this.store.user.getValue().fullName,
              email: this.store.user.getValue().email
            },
            app: COLLABORA_APP_LOCK,
            isExclusive: false
          })
        }
        const documentServerUrl = new URL(data.documentServerUrl)
        documentServerUrl.searchParams.set('lang', this.layout.getCurrentLanguage())
        const theme = this.layout.getCurrentTheme()
        this.collaboraUiDefaults = `UITheme=${theme};`
        this.documentServerUrl = documentServerUrl.toString()
      },
      error: (e: HttpErrorResponse) => {
        this.layout.closeDialog()
        this.layout.sendNotification('error', 'Unable to open document', e.error.message)
      }
    })
  }

  ngOnDestroy() {
    if (this.shouldReconcileMetadata) {
      this.filesService.reconcileMetadataAfterEditorClose(this.file())
    }
    if (!this.isReadonly() && this.file().lock && this.file().lock.owner.login === this.store.user.getValue().login) {
      // Remove lock
      this.file().removeLock()
    }
  }
}
