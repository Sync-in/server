/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { ChangeDetectionStrategy, Component, inject, Input, OnInit } from '@angular/core'
import { DomSanitizer } from '@angular/platform-browser'
import { assetsUrl } from '../../files.constants'

@Component({
  selector: 'app-files-viewer-pdf',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <iframe [src]="url" class="app-viewer-iframe" [style.height.px]="currentHeight"></iframe> `
})
export class FilesViewerPdfComponent implements OnInit {
  @Input() fileUrl: string
  @Input() currentHeight: number
  protected url: any
  private readonly sanitizer = inject(DomSanitizer)
  private readonly pdfjsUrl = `${assetsUrl}/pdfjs/web/viewer.html?file=`

  ngOnInit() {
    this.url = this.sanitizer.bypassSecurityTrustResourceUrl(`${this.pdfjsUrl}${encodeURIComponent(this.fileUrl)}`)
  }
}
