/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpClient, HttpParams } from '@angular/common/http'
import { Component, inject, Input, OnDestroy, OnInit } from '@angular/core'
import { API_FILES_ONLY_OFFICE_SETTINGS } from '@sync-in-server/backend/src/applications/files/constants/routes'
import { OnlyOfficeReqConfig } from '@sync-in-server/backend/src/applications/files/interfaces/only-office-config.interface'
import { SERVER_NAME } from '@sync-in-server/backend/src/common/shared'
import { LayoutService } from '../../../../layout/layout.service'
import { StoreService } from '../../../../store/store.service'
import { FileModel } from '../../models/file.model'
import { OnlyOfficeComponent } from '../utils/only-office.component'

@Component({
  selector: 'app-files-viewer-document',
  imports: [OnlyOfficeComponent],
  template: `
    @if (documentConfig) {
      <div [style.height.px]="currentHeight">
        <app-files-onlyoffice-document
          [id]="docId"
          [documentServerUrl]="documentConfig.documentServerUrl"
          [config]="documentConfig.config"
          (loadError)="loadError($event)"
        ></app-files-onlyoffice-document>
      </div>
    }
  `
})
export class FilesViewerDocumentComponent implements OnInit, OnDestroy {
  @Input() file: FileModel
  @Input() currentHeight: number
  @Input() mode: 'view' | 'edit'
  protected docId: string
  protected documentConfig: OnlyOfficeReqConfig = null
  private readonly http = inject(HttpClient)
  private readonly layout = inject(LayoutService)
  private readonly store = inject(StoreService)

  ngOnInit() {
    this.docId = `viewer-doc-${this.file.id}`
    this.http
      .get<OnlyOfficeReqConfig>(`${API_FILES_ONLY_OFFICE_SETTINGS}/${this.file.path}`, { params: new HttpParams().set('mode', this.mode) })
      .subscribe({
        next: (data) => {
          if (!data) {
            this.layout.closeDialog()
            this.layout.sendNotification('error', 'Unable to open document', 'Settings are missing')
            return
          }
          // do not allow edit if backend only allow 'view' mode
          if (this.mode === 'edit' && data.config.editorConfig.mode !== 'edit') {
            data.config.editorConfig.mode = 'view'
          } else {
            data.config.editorConfig.mode = this.mode
          }
          if (this.mode === 'edit') {
            // set lock on file
            this.file.lock = {
              owner: `${SERVER_NAME} - ${this.store.user.getValue().fullName} (${this.store.user.getValue().email})`,
              ownerLogin: this.store.user.getValue().login,
              isExclusive: false
            }
          }
          data.config.editorConfig.lang = this.layout.getCurrentLanguage()
          data.config.editorConfig.region = this.layout.getCurrentLanguage()
          this.documentConfig = data
        },
        error: (e) => {
          this.layout.closeDialog()
          this.layout.sendNotification('error', 'Unable to open document', e.error.message)
        }
      })
  }

  ngOnDestroy() {
    // remove lock
    this.file.lock = null
  }

  loadError(errorMessage: string): void {
    this.layout.closeDialog()
    this.layout.sendNotification('error', 'Unable to open document', errorMessage)
  }
}
