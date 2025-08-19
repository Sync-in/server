/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Component, inject, Input, OnChanges, OnInit } from '@angular/core'
import { L10N_LOCALE, L10nLocale } from 'angular-l10n'
import { pathSlice } from '../../../../common/utils/functions'
import { ShareLinkModel } from '../../../links/models/share-link.model'
import { ShareModel } from '../../models/share.model'

@Component({
  selector: 'app-share-file-name',
  imports: [],
  template: ` <div class="d-flex align-items-center text-truncate">
    <img [src]="share.mimeUrl" draggable="false" height="30" width="30" alt="" (error)="share.fallBackMimeUrl()" />
    <div class="d-flex flex-column text-truncate ms-2">
      <div class="text-truncate">
        {{ fileName }}
      </div>
    </div>
  </div>`
})
export class ShareFileNameComponent implements OnInit, OnChanges {
  @Input({ required: true }) share: ShareModel | ShareLinkModel
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected fileName: string

  ngOnInit() {
    this.setFilePath()
  }

  ngOnChanges() {
    this.setFilePath()
  }

  setFilePath() {
    const fName: string = this.share.file ? pathSlice(this.share.file.name, -1) : ''
    if (!fName) {
      if (this.share.parent?.id) {
        this.fileName = this.share.parent.name
      } else if (this.share instanceof ShareModel && this.share.externalPath) {
        this.fileName = this.share.externalPath
      }
    } else {
      this.fileName = fName
    }
  }
}
