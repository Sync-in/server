import { DOCUMENT, isPlatformBrowser } from '@angular/common'
import { DestroyRef, Directive, ElementRef, EventEmitter, inject, Injectable, Input, NgZone, OnDestroy, Output, PLATFORM_ID } from '@angular/core'
import type { TapEvent, TapKind, TapPoint } from '../interfaces/tap.interface'

@Injectable({ providedIn: 'root' })
class TapGhostClickGuard {
  private readonly document = inject(DOCUMENT)
  private readonly destroyRef = inject(DestroyRef)
  private readonly zone = inject(NgZone)
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID))
  private readonly duration = 400
  private readonly slop = 24
  private blockedUntil = 0
  private x = 0
  private y = 0

  constructor() {
    if (!this.isBrowser) return
    this.zone.runOutsideAngular(() => {
      this.document.addEventListener('click', this.onClick, { capture: true, passive: false })
    })
    this.destroyRef.onDestroy(() => this.document.removeEventListener('click', this.onClick, true))
  }

  arm(event: PointerEvent) {
    this.blockedUntil = performance.now() + this.duration
    this.x = event.clientX
    this.y = event.clientY
  }

  private onClick = (event: MouseEvent) => {
    if (performance.now() >= this.blockedUntil || Math.hypot(event.clientX - this.x, event.clientY - this.y) > this.slop) return

    this.blockedUntil = 0
    event.preventDefault()
    event.stopImmediatePropagation()
  }
}

@Directive({
  selector: '[appTap]',
  standalone: true,
  host: {
    style: 'touch-action: manipulation; -webkit-tap-highlight-color: transparent; -webkit-touch-callout: none;'
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
  /** Emits a single tap immediately for touch pointers. */
  @Input() singleTapOnTouch = false
  /**
   * ⚙️ Hammer-like behavior control.
   * false → STRICT Hammer mode: no single tap is emitted if the second tap does not occur (default)
   * true → emits a delayed single tap if no second tap is detected within the interval
   */
  @Input() emitSingleWhenNoDouble = false

  @Input() preventGhostClick = true
  @Input() preventDefault = false
  @Input() disabled = false
  /** Synthesizes a contextmenu event for touch-and-hold on iOS, where WebKit does not emit one. */
  @Input() enableLongPressContextMenu = true
  /** Minimum touch duration (in ms) before opening the context menu. */
  @Input() longPressDuration = 550

  @Output() appTap = new EventEmitter<TapEvent>()

  private readonly elRef = inject<ElementRef<HTMLElement>>(ElementRef as any)
  private readonly zone = inject(NgZone)
  private readonly ghostClickGuard = inject(TapGhostClickGuard)
  private el: HTMLElement
  private removeFns: (() => void)[] = []
  private active = false
  private pointerId: number | null = null
  private startX = 0
  private startY = 0
  private startTime = 0
  private moved = false
  private lastEmitTs = 0
  private longPressPointerId: number | null = null
  private longPressTimer: ReturnType<typeof setTimeout> | null = null
  private longPressTriggered = false
  private longPressStartX = 0
  private longPressStartY = 0
  private lastImmediateTouchTap: TapPoint | null = null
  private pendingTap: TapPoint | null = null
  private pendingTapTimer: ReturnType<typeof setTimeout> | null = null

  constructor() {
    this.el = this.elRef.nativeElement
    this.zone.runOutsideAngular(() => {
      this.add('pointerdown', this.onLongPressDown, { passive: true, capture: true })
      this.add('pointermove', this.onLongPressMove, { passive: true, capture: true })
      this.add('pointerup', this.onLongPressEnd, { passive: true, capture: true })
      this.add('pointercancel', this.onLongPressEnd, { passive: true, capture: true })
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
    this.clearPendingTap()
    this.cancelLongPress()
  }

  private onLongPressDown = (ev: PointerEvent) => {
    // A secondary pointer must not cancel the primary pointer's long press.
    if (!ev.isPrimary) return
    this.cancelLongPress()
    this.longPressTriggered = false
    if (
      !this.enableLongPressContextMenu ||
      this.disabled ||
      !this.isIosTouchDevice() ||
      ev.pointerType !== 'touch' ||
      ev.button !== 0 ||
      this.isIgnoredTarget(ev.target)
    ) {
      return
    }

    this.longPressPointerId = ev.pointerId
    const { clientX, clientY } = ev
    this.longPressStartX = clientX
    this.longPressStartY = clientY
    this.longPressTimer = setTimeout(() => {
      if (this.longPressPointerId !== ev.pointerId) return

      this.cancelLongPress()
      if (!this.el.isConnected) return

      this.longPressTriggered = true
      this.zone.run(() =>
        this.el.dispatchEvent(
          new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            view: window,
            button: 2,
            clientX,
            clientY
          })
        )
      )
    }, this.longPressDuration)
  }

  private onLongPressMove = (ev: PointerEvent) => {
    if (ev.pointerId !== this.longPressPointerId) return
    if (Math.abs(ev.clientX - this.longPressStartX) > this.maxMove || Math.abs(ev.clientY - this.longPressStartY) > this.maxMove) {
      this.cancelLongPress()
    }
  }

  private onLongPressEnd = (ev: PointerEvent) => {
    if (ev.pointerId === this.longPressPointerId) this.cancelLongPress()
  }

  private onDown = (ev: PointerEvent) => {
    if (this.disabled || !ev.isPrimary || ev.button !== 0 || this.active || this.isIgnoredTarget(ev.target)) return
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
    if (this.longPressTriggered) {
      this.resetGesture()
      return
    }
    const dt = ev.timeStamp - this.startTime
    const dx = Math.abs(ev.clientX - this.startX)
    const dy = Math.abs(ev.clientY - this.startY)
    const isTap = !this.moved && dx <= this.maxMove && dy <= this.maxMove && dt <= this.maxDuration
    this.resetGesture()
    if (!isTap) return

    if (this.preventDefault) ev.preventDefault()

    const tap: TapPoint = { x: ev.clientX, y: ev.clientY, timestamp: performance.now() }

    if (this.singleTapOnTouch && ev.pointerType === 'touch') {
      this.handleImmediateTouchTap(ev, tap)
      return
    }

    if (!this.enableDoubleTap) {
      this.emit('single', tap.x, tap.y, ev)
      return
    }

    this.handleTapSequence(ev, tap)
  }

  private onCancel = (ev: PointerEvent) => {
    if (ev.pointerId === this.pointerId) this.resetGesture()
  }

  private onContextMenu = (ev: MouseEvent) => {
    if (this.preventDefault) ev.preventDefault()
  }

  private onNativeClick = (ev: MouseEvent) => {
    if (!this.preventGhostClick) return
    if (this.longPressTriggered || performance.now() - this.lastEmitTs < 350) {
      this.longPressTriggered = false
      ev.stopImmediatePropagation()
      ev.stopPropagation()
      ev.preventDefault()
    }
  }

  private handleImmediateTouchTap(event: PointerEvent, tap: TapPoint) {
    const isRepeatedTap = this.isNearbyTap(this.lastImmediateTouchTap, tap)
    // Refresh the reference even when suppressing, so a rapid tap sequence stays throttled until it stops.
    this.lastImmediateTouchTap = tap
    if (isRepeatedTap) {
      // A suppressed pointerup may still produce a compatibility click.
      this.armGhostClickGuard(event)
      return
    }
    this.emit('single', tap.x, tap.y, event)
  }

  private handleTapSequence(event: PointerEvent, tap: TapPoint) {
    if (this.isNearbyTap(this.pendingTap, tap)) {
      this.clearPendingTap()
      this.emit('double', tap.x, tap.y, event)
      return
    }

    this.clearPendingTap()
    this.pendingTap = tap
    this.pendingTapTimer = setTimeout(() => {
      if (this.emitSingleWhenNoDouble && this.pendingTap) {
        this.emit('single', this.pendingTap.x, this.pendingTap.y)
      }
      this.pendingTap = null
      this.pendingTapTimer = null
    }, this.doubleTapInterval)
  }

  private isNearbyTap(previous: TapPoint | null, current: TapPoint): boolean {
    return (
      previous !== null &&
      current.timestamp - previous.timestamp <= this.doubleTapInterval &&
      Math.hypot(current.x - previous.x, current.y - previous.y) <= this.doubleTapSlop
    )
  }

  private clearPendingTap() {
    if (this.pendingTapTimer !== null) clearTimeout(this.pendingTapTimer)
    this.pendingTapTimer = null
    this.pendingTap = null
  }

  private armGhostClickGuard(event: PointerEvent) {
    if (this.preventGhostClick && event.pointerType === 'touch') this.ghostClickGuard.arm(event)
  }

  private emit(type: TapKind, x: number, y: number, sourceEvent?: PointerEvent) {
    if (sourceEvent) this.armGhostClickGuard(sourceEvent)
    this.lastEmitTs = performance.now()
    this.zone.run(() => this.appTap.emit({ x, y, type, sourceEvent }))
  }

  private add<K extends keyof HTMLElementEventMap>(type: K, handler: (ev: any) => void, opts?: AddEventListenerOptions & { capture?: boolean }) {
    this.el.addEventListener(type, handler as EventListener, opts)
    this.removeFns.push(() => this.el.removeEventListener(type, handler as EventListener, opts))
  }

  private resetGesture() {
    this.cancelLongPress()
    this.active = false
    this.pointerId = null
    this.startTime = 0
  }

  private cancelLongPress() {
    if (this.longPressTimer !== null) clearTimeout(this.longPressTimer)
    this.longPressTimer = null
    this.longPressPointerId = null
  }

  private isIgnoredTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false
    const ignoredTarget = target.closest(
      'button, a, input, textarea, select, [contenteditable]:not([contenteditable="false"]), [data-app-tap-ignore]'
    )
    return !!ignoredTarget && ignoredTarget !== this.el && this.el.contains(ignoredTarget)
  }

  private isIosTouchDevice(): boolean {
    if (typeof navigator === 'undefined') return false
    return /iPad|iPhone|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  }
}
