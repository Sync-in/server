import { DOCUMENT, isPlatformBrowser } from '@angular/common'
import { DestroyRef, Directive, ElementRef, EventEmitter, inject, Injectable, Input, NgZone, OnDestroy, Output, PLATFORM_ID } from '@angular/core'

interface TapPoint {
  x: number
  y: number
  timestamp: number
}

const MAX_MOVE = 10
const MAX_DURATION = 350
const DOUBLE_TAP_INTERVAL = 600
const DOUBLE_TAP_SLOP = 24
const NATIVE_CLICK_SUPPRESSION_DURATION = 350
const LONG_PRESS_DURATION = 550
const NEEDS_SYNTHETIC_LONG_PRESS =
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

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
    if (this.blockedUntil === 0) return
    if (performance.now() >= this.blockedUntil) {
      this.blockedUntil = 0
      return
    }
    if (Math.hypot(event.clientX - this.x, event.clientY - this.y) > this.slop) return

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
  /** Enables or disables double-tap detection */
  @Input() enableDoubleTap = true
  /** Emits a single tap immediately for touch pointers. */
  @Input() singleTapOnTouch = false
  @Output() appTap = new EventEmitter<PointerEvent>()
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef as any).nativeElement
  private readonly zone = inject(NgZone)
  private readonly ghostClickGuard = inject(TapGhostClickGuard)
  private readonly removeFns: (() => void)[] = []
  private pointerId: number | null = null
  private startX = 0
  private startY = 0
  private startTime = 0
  private moved = false
  private lastEmitTs = Number.NEGATIVE_INFINITY
  private longPressPointerId: number | null = null
  private longPressTimer: ReturnType<typeof setTimeout> | null = null
  private longPressTriggered = false
  private longPressStartX = 0
  private longPressStartY = 0
  private lastImmediateTouchTap: TapPoint | null = null
  private pendingTap: TapPoint | null = null

  constructor() {
    this.zone.runOutsideAngular(() => {
      // Android and desktop emit contextmenu natively; iOS/iPadOS need a synthesized long-press fallback.
      if (NEEDS_SYNTHETIC_LONG_PRESS) {
        const onLongPressEnd = this.onLongPressEnd.bind(this)
        this.add('pointerdown', this.onLongPressDown.bind(this), { passive: true, capture: true })
        this.add('pointermove', this.onLongPressMove.bind(this), { passive: true, capture: true })
        this.add('pointerup', onLongPressEnd, { passive: true, capture: true })
        this.add('pointercancel', onLongPressEnd, { passive: true, capture: true })
      }
      this.add('pointerdown', this.onDown, { passive: true })
      this.add('pointermove', this.onMove, { passive: true })
      this.add('pointerup', this.onUp, { passive: true })
      this.add('pointercancel', this.onCancel, { passive: true })
      this.add('pointerleave', this.onCancel, { passive: true })
      this.add('click', this.onNativeClick, { passive: false, capture: true })
    })
  }

  ngOnDestroy() {
    for (const off of this.removeFns) off()
    this.removeFns.length = 0
    this.cancelLongPress()
  }

  private onLongPressDown(ev: PointerEvent) {
    // A secondary pointer must not cancel the primary pointer's long press.
    if (!ev.isPrimary) return
    this.cancelLongPress()
    this.longPressTriggered = false
    if (ev.pointerType !== 'touch' || ev.button !== 0 || this.isIgnoredTarget(ev.target)) return

    const { pointerId, clientX, clientY } = ev
    this.longPressPointerId = pointerId
    this.longPressStartX = clientX
    this.longPressStartY = clientY
    this.longPressTimer = setTimeout(() => {
      if (this.longPressPointerId !== pointerId) return

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
    }, LONG_PRESS_DURATION)
  }

  private onLongPressMove(ev: PointerEvent) {
    if (ev.pointerId !== this.longPressPointerId) return
    if (Math.abs(ev.clientX - this.longPressStartX) > MAX_MOVE || Math.abs(ev.clientY - this.longPressStartY) > MAX_MOVE) {
      this.cancelLongPress()
    }
  }

  private onLongPressEnd(ev: PointerEvent) {
    if (ev.pointerId === this.longPressPointerId) this.cancelLongPress()
  }

  private onDown = (ev: PointerEvent) => {
    if (!ev.isPrimary || ev.button !== 0 || this.pointerId !== null || this.isIgnoredTarget(ev.target)) return
    this.pointerId = ev.pointerId
    this.startX = ev.clientX
    this.startY = ev.clientY
    this.startTime = ev.timeStamp
    this.moved = false
    ;(ev.target as Element).setPointerCapture?.(ev.pointerId)
  }

  private onMove = (ev: PointerEvent) => {
    if (ev.pointerId !== this.pointerId) return
    if (!this.moved) {
      const dx = Math.abs(ev.clientX - this.startX)
      const dy = Math.abs(ev.clientY - this.startY)
      if (dx > MAX_MOVE || dy > MAX_MOVE) {
        this.moved = true
        this.pendingTap = null
      }
    }
  }

  private onUp = (ev: PointerEvent) => {
    if (ev.pointerId !== this.pointerId) return
    if (this.longPressTriggered) {
      this.pendingTap = null
      this.resetGesture()
      return
    }
    const dt = ev.timeStamp - this.startTime
    const dx = Math.abs(ev.clientX - this.startX)
    const dy = Math.abs(ev.clientY - this.startY)
    const isTap = !this.moved && dx <= MAX_MOVE && dy <= MAX_MOVE && dt <= MAX_DURATION
    this.resetGesture()
    if (!isTap) {
      this.pendingTap = null
      return
    }

    const isImmediateTouchTap = this.singleTapOnTouch && ev.pointerType === 'touch'
    if (!isImmediateTouchTap && !this.enableDoubleTap) {
      this.pendingTap = null
      this.emit(ev)
      return
    }

    const tap: TapPoint = { x: ev.clientX, y: ev.clientY, timestamp: performance.now() }
    if (isImmediateTouchTap) {
      this.pendingTap = null
      this.handleImmediateTouchTap(ev, tap)
      return
    }

    this.handleTapSequence(ev, tap)
  }

  private onCancel = (ev: PointerEvent) => {
    if (ev.pointerId === this.pointerId) {
      this.pendingTap = null
      this.resetGesture()
    }
  }

  private onNativeClick = (ev: MouseEvent) => {
    if (this.longPressTriggered || performance.now() - this.lastEmitTs < NATIVE_CLICK_SUPPRESSION_DURATION) {
      this.longPressTriggered = false
      ev.stopImmediatePropagation()
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
    this.emit(event)
  }

  private handleTapSequence(event: PointerEvent, tap: TapPoint) {
    if (this.isNearbyTap(this.pendingTap, tap)) {
      this.pendingTap = null
      this.emit(event)
      return
    }

    this.pendingTap = tap
  }

  private isNearbyTap(previous: TapPoint | null, current: TapPoint): boolean {
    return (
      previous !== null &&
      current.timestamp - previous.timestamp <= DOUBLE_TAP_INTERVAL &&
      Math.hypot(current.x - previous.x, current.y - previous.y) <= DOUBLE_TAP_SLOP
    )
  }

  private armGhostClickGuard(event: PointerEvent) {
    if (event.pointerType === 'touch') this.ghostClickGuard.arm(event)
  }

  private emit(event: PointerEvent) {
    this.armGhostClickGuard(event)
    this.lastEmitTs = performance.now()
    this.zone.run(() => this.appTap.emit(event))
  }

  private add<K extends keyof HTMLElementEventMap>(type: K, handler: (ev: any) => void, opts?: AddEventListenerOptions & { capture?: boolean }) {
    this.el.addEventListener(type, handler as EventListener, opts)
    this.removeFns.push(() => this.el.removeEventListener(type, handler as EventListener, opts))
  }

  private resetGesture() {
    this.cancelLongPress()
    this.pointerId = null
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
}
