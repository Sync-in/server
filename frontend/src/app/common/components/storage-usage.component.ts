import { afterNextRender, Component, DestroyRef, ElementRef, inject, input, signal } from '@angular/core'
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
        <span [style.width.px]="labelWidth()" class="ms-1 me-1">
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
  readonly labelWidth = signal<number | null>(null)
  protected readonly elRef = inject(ElementRef)
  private readonly destroyRef = inject(DestroyRef)

  constructor() {
    // measure after the initial render to avoid NG0100
    afterNextRender(() => {
      const host = this.elRef.nativeElement as HTMLElement

      const measure = () => {
        const w = host.offsetWidth
        if (w !== this.labelWidth()) {
          this.labelWidth.set(w)
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
