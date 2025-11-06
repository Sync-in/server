/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Component, input, OnInit } from '@angular/core'
import { FileModel } from '../../models/file.model'

@Component({
  selector: 'app-files-viewer-image',
  template: `<div class="d-flex justify-content-center" [style.height.px]="currentHeight()">
    <img [src]="currentFile.dataUrl" [style.max-height.px]="currentHeight()" alt="" class="img-fluid align-self-center" />
  </div>`
})
export class FilesViewerImageComponent implements OnInit {
  file = input<FileModel>()
  directoryFiles = input<FileModel[]>()
  currentHeight = input<number>()
  protected currentFile: FileModel

  ngOnInit() {
    console.log('init')
    this.currentFile = this.file()
  }
}
