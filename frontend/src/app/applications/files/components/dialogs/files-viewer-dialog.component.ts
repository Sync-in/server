/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Component, computed, inject, Input, model, OnDestroy, OnInit, signal } from '@angular/core'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faEye, faPen } from '@fortawesome/free-solid-svg-icons'
import { FILE_MODE } from '@sync-in-server/backend/src/applications/files/constants/operations'
import type { FileEditorProvider } from '@sync-in-server/backend/src/configuration/config.interfaces'
import { L10nTranslateDirective } from 'angular-l10n'
import { Subscription } from 'rxjs'
import { LayoutService } from '../../../../layout/layout.service'
import { StoreService } from '../../../../store/store.service'
import { SHORT_MIME } from '../../files.constants'
import { FileModel } from '../../models/file.model'
import { FilesViewerCollaboraOnlineComponent } from '../viewers/files-viewer-collabora-online.component'
import { FilesViewerImageComponent } from '../viewers/files-viewer-image.component'
import { FilesViewerMediaComponent } from '../viewers/files-viewer-media.component'
import { FilesViewerOnlyOfficeComponent } from '../viewers/files-viewer-only-office.component'
import { FilesViewerPdfComponent } from '../viewers/files-viewer-pdf.component'
import { FilesViewerTextComponent } from '../viewers/files-viewer-text.component'

@Component({
  selector: 'app-files-viewer-dialog',
  imports: [
    FilesViewerPdfComponent,
    FilesViewerMediaComponent,
    FilesViewerTextComponent,
    FilesViewerImageComponent,
    FaIconComponent,
    FilesViewerOnlyOfficeComponent,
    FilesViewerCollaboraOnlineComponent,
    L10nTranslateDirective
  ],
  templateUrl: 'files-viewer-dialog.component.html'
})
export class FilesViewerDialogComponent implements OnInit, OnDestroy {
  @Input({ required: true }) currentFile: FileModel
  @Input({ required: true }) directoryFiles: FileModel[]
  @Input({ required: true }) mode: FILE_MODE
  @Input({ required: true }) isWriteable: boolean
  @Input({ required: true }) hookedShortMime: string
  @Input({ required: true }) editorProvider: FileEditorProvider
  modalClosing = signal<boolean>(false)
  protected isReadonly = model<boolean>(true)
  protected currentHeight: number
  protected readonly SHORT_MIME = SHORT_MIME
  protected readonly icons = { faEye, faPen }
  protected directoryImages = computed(() => this.directoryFiles.filter((file) => file.isImage))
  private openedFile: { id: string | number; name: string; mimeUrl: string }
  protected readonly store = inject(StoreService)
  private readonly layout = inject(LayoutService)
  private readonly subscription: Subscription = this.layout.resizeEvent.subscribe(() => this.onResize())
  private readonly offsetTop = 42

  ngOnInit() {
    this.isReadonly.set(this.mode === FILE_MODE.VIEW)
    this.openedFile = { id: this.currentFile.id, name: this.currentFile.name, mimeUrl: this.currentFile.mimeUrl }
    this.onResize()
  }

  ngOnDestroy() {
    this.subscription.unsubscribe()
  }

  onClose() {
    if (this.currentFile.isEditable && this.hookedShortMime === SHORT_MIME.TEXT) {
      // Prevent closing the modal without saving when using the text editor
      this.modalClosing.set(true)
      // Force the next state change
      setTimeout(() => this.modalClosing.set(false), 1000)
    } else {
      this.layout.closeDialog(null, this.openedFile.id)
    }
  }

  onMinimize() {
    this.layout.minimizeDialog(this.openedFile.id, { name: this.openedFile.name, mimeUrl: this.openedFile.mimeUrl })
  }

  private onResize() {
    this.currentHeight = window.innerHeight - this.offsetTop
  }
}
