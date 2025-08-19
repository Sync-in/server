/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpClient } from '@angular/common/http'
import { AfterViewInit, Component, Input, OnInit, ViewChild, ViewEncapsulation, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { CodeMirrorComponent } from '../../../../common/components/code-mirror.component'
import { themeDark } from '../../../../layout/layout.interfaces'
import { LayoutService } from '../../../../layout/layout.service'
import { assetsUrl } from '../../files.constants'
import { FileModel } from '../../models/file.model'

@Component({
  selector: 'app-files-viewer-text',
  encapsulation: ViewEncapsulation.None,
  imports: [CodeMirrorComponent, FormsModule],
  styles: [
    `
      .CodeMirror {
        height: 100%;
        font-size: 0.7rem;
      }
    `
  ],
  template: ` <div [style.height.px]="currentHeight">
    <ngx-codemirror #CodeMirror [ngModel]="content" [options]="options"></ngx-codemirror>
  </div>`
})
export class FilesViewerTextComponent implements OnInit, AfterViewInit {
  private readonly http = inject(HttpClient)
  private readonly layout = inject(LayoutService)
  @ViewChild('CodeMirror', { static: true }) ref: any
  @Input() currentHeight: number
  @Input() file: FileModel
  protected ready = false
  protected content: string
  protected options = {
    lineNumbers: false,
    readOnly: true,
    theme: this.layout.switchTheme.getValue() === themeDark ? 'material' : 'default',
    mode: 'null'
  }
  private readonly maxSize = 5242880 // 5MB
  private readonly modeUrl = `${assetsUrl}/codemirror/mode/%N/%N.js`
  private mode: string = null

  ngOnInit() {
    this.ref.codeMirror.modeURL = this.modeUrl
    const detectedMode = this.ref.codeMirror.findModeByFileName(this.file.name)
    if (detectedMode) {
      this.mode = detectedMode.mode
      this.http.get(this.file.dataUrl, { responseType: 'text' }).subscribe((data: string) => (this.content = data))
    } else if (this.file.size <= this.maxSize) {
      this.http.get(this.file.dataUrl, { responseType: 'text' }).subscribe((data: string) => (this.content = data))
    } else {
      this.content = this.layout.translateString('This file contains binary data that can not be read')
    }
  }

  ngAfterViewInit() {
    if (this.mode) {
      this.ref.codeMirror.autoLoadMode(this.ref.textArea, this.mode)
      this.ref.textArea.setOption('mode', this.mode)
      // fix line numbers was calculated too early
      this.options.lineNumbers = true
    }
  }
}
