import type { Observable } from 'rxjs'

export type ToastPauseSource = 'focus' | 'pointer'
export type ToastPositionClass =
  'toast-bottom-center' | 'toast-bottom-left' | 'toast-bottom-right' | 'toast-top-center' | 'toast-top-left' | 'toast-top-right'
export type ToastType = 'error' | 'info' | 'success' | 'warning'

export interface ToastOptions {
  closeButton?: boolean
  disableTimeOut?: boolean
  enableHtml?: boolean
  timeOut?: number
}

export interface ToastItem {
  readonly closeButton: boolean
  readonly enableHtml: boolean
  readonly id: number
  readonly message: string
  readonly title: string
  readonly type: ToastType
}

export interface ToastRef {
  readonly id: number
  readonly onTap: Observable<void>
  dismiss(): void
}

export interface ToastTimerState {
  readonly pauseSources: Set<ToastPauseSource>
  remaining: number
  startedAt: number
  timeoutId: ReturnType<typeof setTimeout> | null
}
