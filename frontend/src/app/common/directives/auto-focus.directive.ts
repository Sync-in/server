import { Directive, ElementRef, inject, input, OnInit } from '@angular/core'

@Directive({ selector: '[appAutofocus]' })
export class AutofocusDirective implements OnInit {
  readonly autoFocus = input(true)
  readonly autoSelect = input(true)
  private readonly elementRef = inject(ElementRef)

  ngOnInit() {
    setTimeout(() => {
      if (this.autoFocus()) {
        this.elementRef.nativeElement.focus()
      }
      if (this.autoSelect()) {
        this.elementRef.nativeElement.select()
      }
    }, 0)
  }
}
