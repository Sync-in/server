/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { NgOptimizedImage } from '@angular/common'
import { Component, inject, OnDestroy } from '@angular/core'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faTimes, faXmark } from '@fortawesome/free-solid-svg-icons'
import { L10nTranslateDirective } from 'angular-l10n'
import { Subscription } from 'rxjs'
import { AutoResizeDirective } from '../../../common/directives/auto-resize.directive'
import { AppWindow, TAB_MENU } from '../../layout.interfaces'
import { LayoutService } from '../../layout.service'

@Component({
  selector: 'app-windows',
  imports: [AutoResizeDirective, FaIconComponent, L10nTranslateDirective, NgOptimizedImage],
  templateUrl: 'windows.component.html'
})
export class WindowsComponent implements OnDestroy {
  protected readonly icons = { faXmark, faTimes }
  protected windows: AppWindow[] = []
  private readonly layout = inject(LayoutService)
  private readonly subscription: Subscription = null

  constructor() {
    this.subscription = this.layout.windows.subscribe((windows: AppWindow[]) => this.setWindows(windows))
  }

  ngOnDestroy() {
    this.subscription.unsubscribe()
  }

  onMaximize(window: AppWindow) {
    this.layout.restoreDialog(window.id)
  }

  onClose(ev: MouseEvent, window: AppWindow) {
    ev.preventDefault()
    ev.stopPropagation()
    const modal = this.layout.modalRefs.get(window.id)
    if (modal) {
      modal.content.onClose()
    }
    this.hideIfNoWindows(this.layout.windows.getValue())
  }

  onCloseAll() {
    for (const w of this.layout.windows.getValue()) {
      const modal = this.layout.modalRefs.get(w.id)
      if (modal) {
        modal.content.onClose()
      }
    }
    this.hideIfNoWindows(this.layout.windows.getValue())
  }

  private setWindows(windows: AppWindow[]) {
    this.hideIfNoWindows(windows)
    this.windows = windows
  }

  private hideIfNoWindows(windows: AppWindow[]) {
    if (!windows.length) {
      this.layout.hideRSideBarTab(TAB_MENU.WINDOWS, 1000)
    }
  }
}
