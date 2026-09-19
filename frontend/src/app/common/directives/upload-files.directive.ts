import { Directive, ElementRef, EventEmitter, inject, Input, OnDestroy, OnInit, Output, Renderer2 } from '@angular/core'

@Directive({ selector: '[appUploadFiles]', exportAs: 'appUploadFiles' })
export class UploadFilesDirective implements OnInit, OnDestroy {
  @Input() options: { isMultiple?: boolean; isDirectory?: boolean }
  @Output() uploadFiles = new EventEmitter<{ files: File[]; isDirectory: boolean }>()
  private elementRef = inject(ElementRef)
  private readonly renderer = inject(Renderer2)
  private fileInput: HTMLInputElement | undefined
  private removeElementListener: (() => void) | undefined
  private removeInputListener: (() => void) | undefined

  ngOnInit() {
    this.fileInput = this.renderer.createElement('input')
    this.renderer.setAttribute(this.fileInput, 'type', 'file')
    this.renderer.setStyle(this.fileInput, 'display', 'none')
    this.renderer.setStyle(this.fileInput, 'position', 'absolute')
    this.renderer.appendChild(this.elementRef.nativeElement, this.fileInput)

    this.removeElementListener = this.renderer.listen(this.elementRef.nativeElement, 'click', (event: MouseEvent) => {
      if (event.target !== this.fileInput) this.open()
    })

    if (this.options?.isMultiple) {
      this.renderer.setAttribute(this.fileInput, 'multiple', 'multiple')
    }
    if (this.options?.isDirectory) {
      this.renderer.setAttribute(this.fileInput, 'webkitdirectory', 'webkitdirectory')
    }

    this.removeInputListener = this.renderer.listen(this.fileInput, 'change', (event: Event) => {
      const input = event.target as HTMLInputElement
      if (input.files?.length) {
        this.uploadFiles.next({ files: Array.from(input.files), isDirectory: this.options?.isDirectory || false })
        input.value = ''
      }
    })
  }

  open() {
    this.fileInput?.click()
  }

  ngOnDestroy() {
    this.removeElementListener?.()
    this.removeInputListener?.()
  }
}
