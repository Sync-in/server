/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Directive, ElementRef, Input, OnInit, inject } from '@angular/core'

@Directive({ selector: '[appAutofocus]' })
export class AutofocusDirective implements OnInit {
  private readonly elementRef = inject(ElementRef)

  @Input() autoFocus = true
  @Input() autoSelect = true

  ngOnInit() {
    setTimeout(() => {
      if (this.autoFocus) {
        this.elementRef.nativeElement.focus()
      }
      if (this.autoSelect) {
        this.elementRef.nativeElement.select()
      }
    }, 0)
  }
}
