/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { AfterViewInit, Directive, ElementRef, Input, OnDestroy, Renderer2, inject } from '@angular/core'
import { skip, Subscription } from 'rxjs'
import { defaultResizeOffset } from '../../layout/layout.constants'
import { LayoutService } from '../../layout/layout.service'

@Directive({ selector: '[appAutoResize]' })
export class AutoResizeDirective implements AfterViewInit, OnDestroy {
  private readonly elementRef = inject(ElementRef)
  private readonly renderer = inject(Renderer2)
  private readonly layout = inject(LayoutService)
  @Input() overFlowX = 'hidden'
  @Input() resizeOffset: number = defaultResizeOffset
  @Input() useMaxHeight = true
  private readonly resizeSubscription: Subscription

  constructor() {
    this.renderer.setStyle(this.elementRef.nativeElement, 'overflow-y', 'auto')
    this.renderer.setStyle(this.elementRef.nativeElement, 'scrollbar-width', 'thin')
    this.resizeSubscription = this.layout.resizeEvent.pipe(skip(1)).subscribe(() => this.onResize())
  }

  ngAfterViewInit() {
    this.renderer.setStyle(this.elementRef.nativeElement, 'overflow-x', this.overFlowX)
    this.onResize()
  }

  ngOnDestroy() {
    this.resizeSubscription.unsubscribe()
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
      this.useMaxHeight ? 'max-height' : 'height',
      `${window.innerHeight - this.resizeOffset - 1}px`
    )
  }
}
