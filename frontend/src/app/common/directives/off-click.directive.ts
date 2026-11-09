import { DestroyRef, Directive, HostListener, inject, input, OnDestroy, OnInit } from '@angular/core'

@Directive({
  // eslint-disable-next-line @angular-eslint/directive-selector
  selector: '[offClick]'
})
export class OffClickDirective implements OnInit, OnDestroy {
  readonly offClickHandler = input.required<(event: MouseEvent) => void>({ alias: 'offClick' })
  private readonly destroyRef = inject(DestroyRef)
  private listenerTimer: ReturnType<typeof setTimeout> | undefined
  private registeredHandler: ((event: MouseEvent) => void) | null = null

  @HostListener('click', ['$event'])
  onClick(event: MouseEvent) {
    event.stopPropagation()
  }

  ngOnInit() {
    this.listenerTimer = setTimeout(() => {
      this.listenerTimer = undefined
      if (this.destroyRef.destroyed || typeof document === 'undefined') return
      this.registeredHandler = this.offClickHandler()
      document.addEventListener('click', this.registeredHandler)
    }, 0)
  }

  ngOnDestroy() {
    clearTimeout(this.listenerTimer)
    this.listenerTimer = undefined
    if (this.registeredHandler && typeof document !== 'undefined') {
      document.removeEventListener('click', this.registeredHandler)
      this.registeredHandler = null
    }
  }
}
