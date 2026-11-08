import { afterNextRender, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, input, signal } from '@angular/core'
import { ProgressbarComponent } from 'ngx-bootstrap/progressbar'
import { ToBytesPipe } from '../pipes/to-bytes.pipe'

@Component({
  selector: 'app-storage-usage',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProgressbarComponent, ToBytesPipe],
  template: `@if (storageQuota() && storageQuota() > 0) {
      <progressbar
        [max]="storageQuota()"
        [value]="storageUsage() ?? 0"
        class="bg-black"
        [type]="(storageUsage() ?? 0) >= storageQuota()! ? 'danger' : null"
      >
        <span [style.width.px]="labelWidth()" class="ms-1 me-1">
          {{ storageUsage() ?? 0 | toBytes: 2 : true }} / {{ storageQuota() | toBytes }}
        </span>
      </progressbar>
    } @else {
      <progressbar [max]="1" [value]="1" class="bg-black" [type]="null">
        <span class="ms-1 me-1">
          {{ storageUsage() ?? 0 | toBytes: 2 : true }}
        </span>
      </progressbar>
    }`
})
export class StorageUsageComponent {
  readonly storageUsage = input<number | null>(0)
  readonly storageQuota = input<number | null>(null)
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
