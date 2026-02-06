import { Directive, ElementRef, EventEmitter, inject, Input, NgZone, OnDestroy, Output } from '@angular/core'

type TapKind = 'single' | 'double'
interface TapEvent {
  x: number
  y: number
  type: TapKind
  sourceEvent?: PointerEvent
}

@Directive({
  selector: '[appTap]',
  standalone: true,
  host: {
    style: 'touch-action: manipulation; -webkit-tap-highlight-color: transparent;'
  }
})
export class TapDirective implements OnDestroy {
  /** Movement tolerance (in px) for a valid tap */
  @Input() maxMove = 10
  /** Maximum duration (in ms) for a single tap */
  @Input() maxDuration = 350
  /** Maximum interval (in ms) between two taps to be considered a double tap */
  @Input() doubleTapInterval = 600
  /** Maximum distance (in px) between the two taps for a double tap */
  @Input() doubleTapSlop = 24
  /** Enables or disables double-tap detection */
  @Input() enableDoubleTap = true
  /**
   * ⚙️ Hammer-like behavior control.
   * false → STRICT Hammer mode: no single tap is emitted if the second tap does not occur (default)
   * true → emits a delayed single tap if no second tap is detected within the interval
   */
  @Input() emitSingleWhenNoDouble = false

  @Input() preventGhostClick = true
  @Input() preventDefault = false
  @Input() disabled = false

  @Output() appTap = new EventEmitter<TapEvent>()

  private readonly elRef = inject<ElementRef<HTMLElement>>(ElementRef as any)
  private readonly zone = inject(NgZone)
  private el: HTMLElement
  private removeFns: (() => void)[] = []
  private active = false
  private pointerId: number | null = null
  private startX = 0
  private startY = 0
  private startTime = 0
  private moved = false
  private lastEmitTs = 0

  private pendingSingle: { x: number; y: number; t: number } | null = null
  private singleTimer: any = null

  constructor() {
    this.el = this.elRef.nativeElement
    this.zone.runOutsideAngular(() => {
      this.add('pointerdown', this.onDown, { passive: true })
      this.add('pointermove', this.onMove, { passive: true })
      this.add('pointerup', this.onUp, { passive: false })
      this.add('pointercancel', this.onCancel, { passive: true })
      this.add('pointerleave', this.onCancel, { passive: true })
      this.add('contextmenu', this.onContextMenu, { passive: false })
      this.add('click', this.onNativeClick, { passive: false, capture: true })
    })
  }

  ngOnDestroy() {
    for (const off of this.removeFns) off()
    this.removeFns = []
    clearTimeout(this.singleTimer)
  }

  private onDown = (ev: PointerEvent) => {
    if (this.disabled || ev.button !== 0 || this.active) return
    this.active = true
    this.pointerId = ev.pointerId
    this.startX = ev.clientX
    this.startY = ev.clientY
    this.startTime = ev.timeStamp
    this.moved = false
    ;(ev.target as Element).setPointerCapture?.(ev.pointerId)
  }

  private onMove = (ev: PointerEvent) => {
    if (!this.active || ev.pointerId !== this.pointerId) return
    if (!this.moved) {
      const dx = Math.abs(ev.clientX - this.startX)
      const dy = Math.abs(ev.clientY - this.startY)
      if (dx > this.maxMove || dy > this.maxMove) this.moved = true
    }
  }

  private onUp = (ev: PointerEvent) => {
    if (!this.active || ev.pointerId !== this.pointerId) return
    const dt = ev.timeStamp - this.startTime
    const dx = Math.abs(ev.clientX - this.startX)
    const dy = Math.abs(ev.clientY - this.startY)
    const isTap = !this.moved && dx <= this.maxMove && dy <= this.maxMove && dt <= this.maxDuration
    this.resetGesture()
    if (!isTap) return

    if (this.preventDefault) ev.preventDefault()

    const now = performance.now()
    const x = ev.clientX
    const y = ev.clientY

    if (!this.enableDoubleTap) {
      this.emit('single', x, y, ev)
      return
    }

    // Double tap detection
    if (this.pendingSingle) {
      const dt2 = now - this.pendingSingle.t
      const dist = Math.hypot(x - this.pendingSingle.x, y - this.pendingSingle.y)
      if (dt2 <= this.doubleTapInterval && dist <= this.doubleTapSlop) {
        clearTimeout(this.singleTimer)
        this.singleTimer = null
        this.pendingSingle = null
        this.emit('double', x, y, ev)
        return
      }
    }

    // First tap
    this.pendingSingle = { x, y, t: now }
    clearTimeout(this.singleTimer)
    this.singleTimer = setTimeout(() => {
      if (this.emitSingleWhenNoDouble) {
        const p = this.pendingSingle!
        this.emit('single', p.x, p.y)
      }
      this.pendingSingle = null
      this.singleTimer = null
    }, this.doubleTapInterval)
  }

  private onCancel = () => this.resetGesture()

  private onContextMenu = (ev: MouseEvent) => {
    if (this.preventDefault) ev.preventDefault()
  }

  private onNativeClick = (ev: MouseEvent) => {
    if (!this.preventGhostClick) return
    if (performance.now() - this.lastEmitTs < 350) {
      ev.stopImmediatePropagation()
      ev.stopPropagation()
      ev.preventDefault()
    }
  }

  private emit(type: TapKind, x: number, y: number, sourceEvent?: PointerEvent) {
    this.lastEmitTs = performance.now()
    this.zone.run(() => this.appTap.emit({ x, y, type, sourceEvent }))
  }

  private add<K extends keyof HTMLElementEventMap>(type: K, handler: (ev: any) => void, opts?: AddEventListenerOptions & { capture?: boolean }) {
    this.el.addEventListener(type, handler as EventListener, opts)
    this.removeFns.push(() => this.el.removeEventListener(type, handler as EventListener, opts))
  }

  private resetGesture() {
    this.active = false
    this.pointerId = null
    this.startTime = 0
  }
}
