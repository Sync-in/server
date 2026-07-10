import { booleanAttribute, Directive, ElementRef, EventEmitter, HostListener, inject, Input, OnInit, Output, Renderer2 } from '@angular/core'

@Directive({
  selector: '[appInputEdit]'
})
export class InputEditDirective implements OnInit {
  @Input() inputObject: { isRenamed: boolean } & any
  @Input() inputField = 'name'
  @Input() fullWidth = false
  @Input() textCenter = false
  @Input() disableOnBlur = true
  @Input() disableFocus = false
  @Input() disableKeyboard = false
  @Input({ transform: booleanAttribute }) selectFileNameWithoutExtension = false
  @Output() updateObject = new EventEmitter<{ object: any; name: string }>(true)
  @Output() renamingInProgress = new EventEmitter<boolean>(true)
  private readonly elementRef = inject(ElementRef)
  private readonly renderer = inject(Renderer2)
  private dangerColor = '#dd4b39'
  private primaryColor = '#3c8dbc'

  ngOnInit() {
    this.initStyles()
    this.renamingInProgress.emit(true)
    this.elementRef.nativeElement.value = this.inputObject[this.inputField]
    setTimeout(() => {
      this.setParentDraggable('false')
      if (!this.disableFocus) {
        this.elementRef.nativeElement.focus()
        this.selectInputValue()
      }
    }, 5)
  }

  @HostListener('blur')
  onBlur() {
    this.validateInput()
    if (this.disableOnBlur) {
      this.disableEdit()
    }
  }

  @HostListener('keyup.enter')
  onEnter() {
    if (this.disableKeyboard) {
      return
    }
    this.validateInput()
  }

  @HostListener('keyup.esc')
  onEscape() {
    if (!this.disableKeyboard) {
      this.disableEdit()
    }
  }

  @HostListener('pointerdown', ['$event'])
  stopPointerEvent(ev: Event) {
    // Prevent parent tap/drag handlers from stealing Chromium's text caret.
    ev.stopPropagation()
  }

  private initStyles() {
    this.renderer.setStyle(this.elementRef.nativeElement, 'display', 'inline')
    this.renderer.setStyle(this.elementRef.nativeElement, 'height', '100%')
    this.renderer.setStyle(this.elementRef.nativeElement, 'min-height', '20px')
    this.renderer.addClass(this.elementRef.nativeElement, 'form-control')
    if (this.textCenter) {
      this.renderer.addClass(this.elementRef.nativeElement, 'text-center')
      this.renderer.setStyle(this.elementRef.nativeElement, 'padding', '0')
    } else {
      this.renderer.setStyle(this.elementRef.nativeElement, 'padding', '2px')
    }
    if (this.fullWidth) {
      this.renderer.addClass(this.elementRef.nativeElement, 'w-100')
    } else {
      this.renderer.addClass(this.elementRef.nativeElement, 'w-75')
    }
  }

  private setIncorrectForm() {
    this.renderer.addClass(this.elementRef.nativeElement, 'is-invalid')
    this.renderer.setStyle(this.elementRef.nativeElement, 'border-color', this.dangerColor)
  }

  private setCorrectForm() {
    this.renderer.removeClass(this.elementRef.nativeElement, 'is-invalid')
    this.renderer.setStyle(this.elementRef.nativeElement, 'border-color', this.primaryColor)
  }

  private validateInput() {
    if (!this.elementRef.nativeElement.value) {
      this.setIncorrectForm()
    } else {
      if (this.elementRef.nativeElement.value === this.inputObject[this.inputField]) {
        this.setCorrectForm()
        this.disableEdit()
      } else {
        this.setCorrectForm()
        this.updateObject.next({ object: this.inputObject, name: this.elementRef.nativeElement.value })
        this.disableEdit()
      }
    }
  }

  private selectInputValue() {
    if (!this.selectFileNameWithoutExtension) {
      this.elementRef.nativeElement.select()
      return
    }
    const pos = this.elementRef.nativeElement.value.lastIndexOf('.')
    this.elementRef.nativeElement.setSelectionRange(0, pos > 0 ? pos : this.elementRef.nativeElement.value.length)
  }

  private disableEdit() {
    this.setParentDraggable('true')
    this.renamingInProgress.emit(false)
    setTimeout(() => (this.inputObject.isRenamed = false), 100)
  }

  private setParentDraggable(state: string) {
    // fix bug with FF that prevents from clicking on input element
    this.renderer.setAttribute(this.elementRef.nativeElement.parentElement, 'draggable', state)
  }
}
