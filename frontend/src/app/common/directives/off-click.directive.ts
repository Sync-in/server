/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Directive, HostListener, Input, OnDestroy, OnInit } from '@angular/core'

@Directive({
  // eslint-disable-next-line @angular-eslint/directive-selector
  selector: '[offClick]'
})
export class OffClickDirective implements OnInit, OnDestroy {
  @Input('offClick') offClickHandler: any

  @HostListener('click', ['$event'])
  onClick(event: MouseEvent) {
    event.stopPropagation()
  }

  ngOnInit() {
    setTimeout(() => {
      if (typeof document !== 'undefined') {
        document.addEventListener('click', this.offClickHandler)
      }
    }, 0)
  }

  ngOnDestroy() {
    if (typeof document !== 'undefined') {
      document.removeEventListener('click', this.offClickHandler)
    }
  }
}
