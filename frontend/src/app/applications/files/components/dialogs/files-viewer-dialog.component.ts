/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpClient, HttpErrorResponse } from '@angular/common/http'
import { Component, Input, OnDestroy, OnInit, inject } from '@angular/core'
import { Subscription } from 'rxjs'
import { LayoutService } from '../../../../layout/layout.service'
import { FileModel } from '../../models/file.model'
import { FilesViewerDocumentComponent } from '../viewers/files-viewer-document.component'
import { FilesViewerHtmlComponent } from '../viewers/files-viewer-html.component'
import { FilesViewerMediaComponent } from '../viewers/files-viewer-media.component'
import { FilesViewerPdfComponent } from '../viewers/files-viewer-pdf.component'
import { FilesViewerTextComponent } from '../viewers/files-viewer-text.component'

@Component({
  selector: 'app-files-viewer-dialog',
  imports: [FilesViewerPdfComponent, FilesViewerMediaComponent, FilesViewerHtmlComponent, FilesViewerTextComponent, FilesViewerDocumentComponent],
  templateUrl: 'files-viewer-dialog.component.html'
})
export class FilesViewerDialogComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient)
  private readonly layout = inject(LayoutService)
  @Input() currentFile: FileModel
  @Input() mode: 'view' | 'edit' = 'view'
  private subscription: Subscription = null
  private readonly offsetTop = 42
  private hookShortMime = null
  protected canAccess = false
  protected currentHeight: number

  ngOnInit() {
    this.subscription = this.layout.resizeEvent.subscribe(() => this.onResize())
    this.http.head(this.currentFile.dataUrl).subscribe({
      next: () => {
        if (this.mode === 'view' && this.currentFile.shortMime === 'document' && this.currentFile.mime === 'text-plain') {
          this.hookShortMime = this.currentFile.shortMime
          this.currentFile.shortMime = null
        } else if (this.mode === 'view' && this.currentFile.shortMime === 'text' && this.currentFile.mime === 'text-html') {
          this.hookShortMime = this.currentFile.shortMime
          this.currentFile.shortMime = 'html'
        } else if (this.mode === 'edit' && this.currentFile.shortMime === 'pdf') {
          this.hookShortMime = this.currentFile.shortMime
          this.currentFile.shortMime = 'document'
        }
        this.onResize()
        this.canAccess = true
      },
      error: (err: HttpErrorResponse) => {
        console.error(err.message)
        this.layout.sendNotification('error', 'Unable to open document', this.currentFile?.name)
        this.onClose()
      }
    })
  }

  ngOnDestroy() {
    this.subscription.unsubscribe()
    if (this.hookShortMime) {
      this.currentFile.shortMime = this.hookShortMime
    }
  }

  private onResize() {
    this.currentHeight = window.innerHeight - this.offsetTop
  }

  onClose() {
    this.layout.closeDialog(null, this.currentFile.id)
  }

  onMinimize() {
    this.layout.minimizeDialog(this.currentFile.id, { name: this.currentFile.name, mimeUrl: this.currentFile.mimeUrl })
  }
}
