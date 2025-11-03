/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core'
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser'
import { assetsUrl } from '../../files.constants'

@Component({
  selector: 'app-files-viewer-pdf',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <iframe [src]="url()" class="app-viewer-iframe" [style.height.px]="currentHeight()"></iframe> `
})
export class FilesViewerPdfComponent {
  fileUrl = input<string>()
  currentHeight = input<number>()
  private readonly sanitizer = inject(DomSanitizer)
  private readonly pdfjsUrl = `${assetsUrl}/pdfjs/web/viewer.html?file=`
  url = computed<SafeResourceUrl | null>(() =>
    this.fileUrl() ? this.sanitizer.bypassSecurityTrustResourceUrl(`${this.pdfjsUrl}${encodeURIComponent(this.fileUrl())}`) : null
  )
}
