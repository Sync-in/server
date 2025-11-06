/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Component, computed, inject, Input, OnDestroy, OnInit } from '@angular/core'
import { Subscription } from 'rxjs'
import { LayoutService } from '../../../../layout/layout.service'
import { FileModel } from '../../models/file.model'
import { FilesViewerDocumentComponent } from '../viewers/files-viewer-document.component'
import { FilesViewerImageComponent } from '../viewers/files-viewer-image.component'
import { FilesViewerMediaComponent } from '../viewers/files-viewer-media.component'
import { FilesViewerPdfComponent } from '../viewers/files-viewer-pdf.component'
import { FilesViewerTextComponent } from '../viewers/files-viewer-text.component'

@Component({
  selector: 'app-files-viewer-dialog',
  imports: [FilesViewerPdfComponent, FilesViewerMediaComponent, FilesViewerTextComponent, FilesViewerDocumentComponent, FilesViewerImageComponent],
  templateUrl: 'files-viewer-dialog.component.html'
})
export class FilesViewerDialogComponent implements OnInit, OnDestroy {
  @Input({ required: true }) currentFile: FileModel
  @Input({ required: true }) directoryFiles: FileModel[]
  @Input({ required: true }) mode: 'view' | 'edit'
  @Input({ required: true }) shortMime: string
  protected currentHeight: number
  protected directoryImages = computed(() => this.directoryFiles.filter((file) => file.isImage))
  private readonly layout = inject(LayoutService)
  private readonly subscription: Subscription = this.layout.resizeEvent.subscribe(() => this.onResize())
  private readonly offsetTop = 42

  ngOnInit() {
    this.onResize()
  }

  ngOnDestroy() {
    this.subscription.unsubscribe()
  }

  onClose() {
    this.layout.closeDialog(null, this.currentFile.id)
  }

  onMinimize() {
    this.layout.minimizeDialog(this.currentFile.id, { name: this.currentFile.name, mimeUrl: this.currentFile.mimeUrl })
  }

  private onResize() {
    this.currentHeight = window.innerHeight - this.offsetTop
  }
}
