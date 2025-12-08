/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http'
import { Component, inject, input, Input, OnDestroy, OnInit } from '@angular/core'
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser'
import { FILE_MODE } from '@sync-in-server/backend/src/applications/files/constants/operations'
import { COLLABORA_OWNER_LOCK } from '@sync-in-server/backend/src/applications/files/modules/collabora-online/collabora-online.constants'
import type { CollaboraOnlineReqDto } from '@sync-in-server/backend/src/applications/files/modules/collabora-online/collabora-online.dtos'
import { API_COLLABORA_ONLINE_SETTINGS } from '@sync-in-server/backend/src/applications/files/modules/collabora-online/collabora-online.routes'
import { LayoutService } from '../../../../layout/layout.service'
import { StoreService } from '../../../../store/store.service'
import { FileModel } from '../../models/file.model'

@Component({
  selector: 'app-files-viewer-collabora-online',
  template: `
    @if (documentServerUrl) {
      <iframe
        [src]="documentServerUrl"
        [style.height.px]="currentHeight()"
        class="app-viewer-iframe"
        allow="clipboard-read *; clipboard-write *; fullscreen"
      ></iframe>
    }
  `
})
export class FilesViewerCollaboraOnlineComponent implements OnInit, OnDestroy {
  @Input({ required: true }) file: FileModel
  @Input({ required: true }) mode: FILE_MODE
  currentHeight = input<number>()
  protected documentServerUrl: SafeResourceUrl = null
  private readonly http = inject(HttpClient)
  private readonly layout = inject(LayoutService)
  private readonly store = inject(StoreService)
  private readonly sanitizer = inject(DomSanitizer)

  ngOnInit() {
    this.http
      .get<CollaboraOnlineReqDto>(`${API_COLLABORA_ONLINE_SETTINGS}/${this.file.path}`, { params: new HttpParams().set('mode', this.mode) })
      .subscribe({
        next: (data) => {
          if (!data) {
            this.layout.closeDialog()
            this.layout.sendNotification('error', 'Unable to open document', 'Settings are missing')
            return
          }
          if (data.mode === FILE_MODE.EDIT) {
            // Set lock on file
            this.file.createLock({
              owner: `${COLLABORA_OWNER_LOCK} - ${this.store.user.getValue().fullName} (${this.store.user.getValue().email})`,
              ownerLogin: this.store.user.getValue().login,
              isExclusive: false
            })
          }
          this.documentServerUrl = this.sanitizer.bypassSecurityTrustResourceUrl(`${data.documentServerUrl}&lang=${this.layout.getCurrentLanguage()}`)
        },
        error: (e: HttpErrorResponse) => {
          this.layout.closeDialog()
          this.layout.sendNotification('error', 'Unable to open document', e.error.message)
        }
      })
  }

  ngOnDestroy() {
    // Remove lock
    this.file.removeLock()
  }
}
