/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Component, EventEmitter, inject, Input, OnInit, Output } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { TooltipModule } from 'ngx-bootstrap/tooltip'
import { convertBytesToText, convertTextToBytes } from '../utils/functions'
import { quotaRegexp } from '../utils/regexp'

@Component({
  selector: 'app-storage-quota',
  imports: [L10nTranslatePipe, TooltipModule, FormsModule, L10nTranslateDirective],
  template: ` <label for="storageQuota" l10nTranslate>Storage Quota</label>
    <div id="storageQuota">
      <input
        id="quota"
        [(ngModel)]="quotaText"
        (ngModelChange)="validateQuota()"
        (blur)="onQuotaBlur()"
        [placeholder]="'Unlimited' | translate: locale.language"
        class="form-control form-control-sm {{ invalid ? 'is-invalid' : '' }}"
        [class.w-100]="fullWidth"
        [style.max-width.%]="maxWidthPercent"
        placement="top"
        tooltip='"512 MB" "12 GB" "2 TB" ...'
        triggers="focus"
        type="text"
      />
    </div>`
})
export class StorageQuotaComponent implements OnInit {
  @Input() quota: number
  @Output() quotaChange = new EventEmitter<number>()
  @Input() maxWidthPercent = 75
  @Input() fullWidth = false
  protected locale = inject<L10nLocale>(L10N_LOCALE)
  protected quotaText: string
  protected invalid = false

  ngOnInit() {
    if (this.fullWidth) {
      this.maxWidthPercent = 100
    }
    if (this.quota !== null) {
      this.quotaText = this.quota === 0 ? '0' : convertBytesToText(this.quota)
    }
  }

  onQuotaBlur() {
    if (this.quotaText) {
      if (this.quotaText === '0') {
        this.quotaChange.emit(0)
        return
      }
      const b = quotaRegexp.exec(this.quotaText)
      if (b) {
        this.quotaText = `${b[1]} ${b[2].toUpperCase()}`
        this.quotaChange.emit(convertTextToBytes(parseInt(b[1]), b[2]))
        return
      }
    }
    this.quotaChange.emit(null)
  }

  validateQuota() {
    this.invalid = this.quotaText && this.quotaText !== '0' && !quotaRegexp.test(this.quotaText)
  }
}
