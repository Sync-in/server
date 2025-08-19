/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpClient } from '@angular/common/http'
import { Component, Input, OnInit, inject } from '@angular/core'
import { DomSanitizer } from '@angular/platform-browser'
import { LayoutService } from '../../../../layout/layout.service'

@Component({
  selector: 'app-files-viewer-html',
  template: `@if (content) {
    <iframe [src]="content" [style.height.px]="currentHeight" class="app-viewer-iframe" sandbox></iframe>
  }`
})
export class FilesViewerHtmlComponent implements OnInit {
  private readonly http = inject(HttpClient)
  private readonly sanitizer = inject(DomSanitizer)
  private readonly layout = inject(LayoutService)
  @Input() currentHeight: number
  @Input() fileUrl: string
  protected content: any = null

  ngOnInit() {
    this.http.get(this.fileUrl, { responseType: 'text' }).subscribe({
      next: (data: string) => (this.content = this.sanitizer.bypassSecurityTrustResourceUrl(`data:text/html,${data}`)),
      error: (e) => {
        this.content = this.sanitizer.bypassSecurityTrustResourceUrl(
          `data:text/html,${this.layout.translateString('Unable to open document')} : ${e.statusText}`
        )
      }
    })
  }
}
