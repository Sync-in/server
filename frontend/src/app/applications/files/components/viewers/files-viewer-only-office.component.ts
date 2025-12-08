/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http'
import { Component, inject, input, Input, OnDestroy, OnInit } from '@angular/core'
import { FILE_MODE } from '@sync-in-server/backend/src/applications/files/constants/operations'
import { ONLY_OFFICE_OWNER_LOCK } from '@sync-in-server/backend/src/applications/files/modules/only-office/only-office.constants'
import type { OnlyOfficeReqDto } from '@sync-in-server/backend/src/applications/files/modules/only-office/only-office.dtos'
import { API_ONLY_OFFICE_SETTINGS } from '@sync-in-server/backend/src/applications/files/modules/only-office/only-office.routes'
import { LayoutService } from '../../../../layout/layout.service'
import { StoreService } from '../../../../store/store.service'
import { FileModel } from '../../models/file.model'
import { OnlyOfficeComponent } from '../utils/only-office.component'

@Component({
  selector: 'app-files-viewer-only-office',
  imports: [OnlyOfficeComponent],
  styles: [
    `
      // fix onlyoffice iframe blinking when we hide and show via the windows manager
      .doc-placeholder {
        display: none !important;
      }
    `
  ],
  template: `
    @if (documentConfig) {
      <div [style.height.px]="currentHeight()">
        <app-files-onlyoffice-document
          [id]="docId"
          [documentServerUrl]="documentConfig.documentServerUrl"
          [config]="documentConfig.config"
          (loadError)="loadError($event)"
          (wasSaved)="onSave()"
        ></app-files-onlyoffice-document>
      </div>
    }
  `
})
export class FilesViewerOnlyOfficeComponent implements OnInit, OnDestroy {
  @Input({ required: true }) file: FileModel
  @Input({ required: true }) mode: FILE_MODE
  currentHeight = input<number>()
  protected docId: string
  protected documentConfig: OnlyOfficeReqDto = null
  private readonly http = inject(HttpClient)
  private readonly layout = inject(LayoutService)
  private readonly store = inject(StoreService)

  ngOnInit() {
    this.docId = `viewer-doc-${this.file.id}`
    this.http.get<OnlyOfficeReqDto>(`${API_ONLY_OFFICE_SETTINGS}/${this.file.path}`, { params: new HttpParams().set('mode', this.mode) }).subscribe({
      next: (data) => {
        if (!data) {
          this.layout.closeDialog()
          this.layout.sendNotification('error', 'Unable to open document', 'Settings are missing')
          return
        }
        if (data.config.editorConfig.mode === FILE_MODE.EDIT) {
          // Set lock on file
          this.file.createLock({
            owner: `${ONLY_OFFICE_OWNER_LOCK} - ${this.store.user.getValue().fullName} (${this.store.user.getValue().email})`,
            ownerLogin: this.store.user.getValue().login,
            isExclusive: false
          })
        }
        data.config.editorConfig.lang = this.layout.getCurrentLanguage()
        data.config.editorConfig.region = data.config.editorConfig.lang
        this.documentConfig = data
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

  loadError(e: { title: string; message: string }): void {
    this.layout.closeDialog()
    this.layout.sendNotification('error', e.title, e.message)
  }

  onSave() {
    this.file.updateHTimeAgo()
  }
}
