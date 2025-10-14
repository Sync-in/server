/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { afterNextRender, ChangeDetectorRef, Component, DestroyRef, ElementRef, inject, input } from '@angular/core'
import type { StorageQuota } from '@sync-in-server/backend/src/common/interfaces'
import { ProgressbarComponent } from 'ngx-bootstrap/progressbar'
import { ToBytesPipe } from '../pipes/to-bytes.pipe'

@Component({
  selector: 'app-storage-usage',
  imports: [ProgressbarComponent, ToBytesPipe],
  template: `@if (item().storageQuota && item().storageQuota > 0) {
      <progressbar
        [max]="item().storageQuota"
        [value]="item().storageUsage"
        class="bg-black"
        [type]="this.item().storageUsage >= this.item().storageQuota ? 'danger' : null"
      >
        <span [style.width.px]="labelWidth ?? null" class="ms-1 me-1">
          {{ item().storageUsage | toBytes: 2 : true }} / {{ item().storageQuota | toBytes }}
        </span>
      </progressbar>
    } @else {
      <progressbar [max]="1" [value]="1" class="bg-black" [type]="null">
        <span class="ms-1 me-1">
          {{ item().storageUsage | toBytes: 2 : true }}
        </span>
      </progressbar>
    }`
})
export class StorageUsageComponent {
  item = input<StorageQuota>({ storageUsage: 0, storageQuota: null })
  labelWidth: number | null = null
  protected readonly elRef = inject(ElementRef)
  // helpers for safe updates
  private readonly cdr = inject(ChangeDetectorRef)
  private readonly destroyRef = inject(DestroyRef)

  constructor() {
    // measure after the initial render to avoid NG0100
    afterNextRender(() => {
      const host = this.elRef.nativeElement as HTMLElement

      const measure = () => {
        const w = host.offsetWidth
        if (w !== this.labelWidth) {
          this.labelWidth = w
          // force CD since we update after first check
          this.cdr.detectChanges()
        }
      }

      measure()

      const ro = new ResizeObserver(() => measure())
      ro.observe(host)
      // cleanup
      this.destroyRef.onDestroy(() => ro.disconnect())
    })
  }
}
