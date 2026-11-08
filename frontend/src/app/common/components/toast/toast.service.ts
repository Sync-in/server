import { DestroyRef, inject, Injectable, signal } from '@angular/core'
import { Subject } from 'rxjs'
import type {
  ToastItem,
  ToastOptions,
  ToastPauseSource,
  ToastPositionClass,
  ToastRef,
  ToastTimerState,
  ToastType
} from './interfaces/toast.interface'

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly defaultTimeOut = 6000
  private readonly defaultPositionClass: ToastPositionClass = 'toast-bottom-right'
  private readonly extendedTimeOut = 1000
  private readonly maxToasts = 6
  private readonly toastState = signal<readonly ToastItem[]>([])
  readonly toasts = this.toastState.asReadonly()
  readonly positionClass = signal<ToastPositionClass>(this.defaultPositionClass)

  private readonly destroyRef = inject(DestroyRef)
  private readonly tapSubjects = new Map<number, Subject<void>>()
  private readonly timerStates = new Map<number, ToastTimerState>()
  private nextId = 0

  constructor() {
    this.destroyRef.onDestroy(() => this.clear())
  }

  show(type: ToastType, title: string, message: string, options: ToastOptions = {}): ToastRef {
    const id = ++this.nextId
    const tapSubject = new Subject<void>()
    const duration = this.resolveDuration(options)
    const toast: ToastItem = {
      id,
      type,
      title,
      message,
      closeButton: options.closeButton ?? true,
      enableHtml: options.enableHtml ?? false
    }
    const currentToasts = this.toastState()

    for (const removedToast of currentToasts.slice(this.maxToasts - 1)) {
      this.dispose(removedToast.id)
    }

    this.tapSubjects.set(id, tapSubject)
    if (duration !== null) {
      this.timerStates.set(id, {
        timeoutId: null,
        startedAt: 0,
        remaining: duration,
        pauseSources: new Set<ToastPauseSource>()
      })
    }
    this.toastState.set([toast, ...currentToasts.slice(0, this.maxToasts - 1)])
    this.startTimer(id)

    return {
      id,
      onTap: tapSubject.asObservable(),
      dismiss: () => this.dismiss(id)
    }
  }

  tap(id: number): void {
    if (!this.toastState().some((toast) => toast.id === id)) return

    this.tapSubjects.get(id)?.next()
    this.dismiss(id)
  }

  dismiss(id: number): void {
    if (!this.toastState().some((toast) => toast.id === id)) return

    this.toastState.update((toasts) => toasts.filter((toast) => toast.id !== id))
    this.dispose(id)
  }

  pause(id: number, source: ToastPauseSource): void {
    const timerState = this.timerStates.get(id)
    if (!timerState || timerState.pauseSources.has(source)) return

    timerState.pauseSources.add(source)
    if (timerState.pauseSources.size > 1 || timerState.timeoutId === null) return

    clearTimeout(timerState.timeoutId)
    timerState.timeoutId = null
    timerState.remaining = Math.max(0, timerState.remaining - (performance.now() - timerState.startedAt))
  }

  resume(id: number, source: ToastPauseSource): void {
    const timerState = this.timerStates.get(id)
    if (!timerState || !timerState.pauseSources.delete(source)) return

    if (source === 'pointer') {
      timerState.remaining = Math.max(timerState.remaining, this.extendedTimeOut)
    }
    if (timerState.pauseSources.size) return

    if (timerState.remaining <= 0) {
      this.dismiss(id)
      return
    }
    this.startTimer(id)
  }

  clear(): void {
    for (const id of this.tapSubjects.keys()) {
      this.dispose(id)
    }
    this.toastState.set([])
  }

  private resolveDuration(options: ToastOptions): number | null {
    if (options.disableTimeOut) return null

    const duration = options.timeOut ?? this.defaultTimeOut
    return duration > 0 ? duration : null
  }

  private startTimer(id: number): void {
    const timerState = this.timerStates.get(id)
    if (!timerState || timerState.pauseSources.size || timerState.timeoutId !== null) return

    timerState.startedAt = performance.now()
    timerState.timeoutId = setTimeout(() => {
      const currentTimerState = this.timerStates.get(id)
      if (!currentTimerState) return

      currentTimerState.timeoutId = null
      if (!currentTimerState.pauseSources.size) this.dismiss(id)
    }, timerState.remaining)
  }

  private dispose(id: number): void {
    const timerState = this.timerStates.get(id)
    if (timerState && timerState.timeoutId !== null) {
      clearTimeout(timerState.timeoutId)
    }
    this.timerStates.delete(id)

    this.tapSubjects.get(id)?.complete()
    this.tapSubjects.delete(id)
  }
}
