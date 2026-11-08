import { AfterViewInit, Directive, ElementRef, inject, input, OnChanges, Renderer2, SimpleChanges } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { skip } from 'rxjs'
import { defaultResizeOffset } from '../../layout/layout.constants'
import { LayoutService } from '../../layout/layout.service'

@Directive({ selector: '[appAutoResize]' })
export class AutoResizeDirective implements AfterViewInit, OnChanges {
  readonly overFlowX = input('hidden')
  readonly resizeOffset = input(defaultResizeOffset)
  readonly useMaxHeight = input(true)
  private readonly elementRef = inject(ElementRef)
  private readonly renderer = inject(Renderer2)
  private readonly layout = inject(LayoutService)
  private viewInitialized = false

  constructor() {
    this.renderer.setStyle(this.elementRef.nativeElement, 'overflow-y', 'auto')
    this.renderer.setStyle(this.elementRef.nativeElement, 'scrollbar-width', 'thin')
    this.layout.resizeEvent.pipe(skip(1), takeUntilDestroyed()).subscribe(() => this.onResize())
  }

  ngAfterViewInit() {
    this.renderer.setStyle(this.elementRef.nativeElement, 'overflow-x', this.overFlowX())
    this.viewInitialized = true
    this.onResize()
  }

  ngOnChanges(changes: SimpleChanges) {
    if (this.viewInitialized && (changes.resizeOffset || changes.useMaxHeight)) this.onResize()
  }

  scrollTop() {
    this.renderer.setProperty(this.elementRef.nativeElement, 'scrollTop', '0')
  }

  scrollIntoView(topPosition: number = 0) {
    setTimeout(() => this.elementRef.nativeElement.scrollTo({ left: 0, top: topPosition, behavior: 'smooth' }), 50)
  }

  private onResize() {
    this.renderer.setStyle(
      this.elementRef.nativeElement,
      this.useMaxHeight() ? 'max-height' : 'height',
      `${window.innerHeight - this.resizeOffset() - 1}px`
    )
  }
}
