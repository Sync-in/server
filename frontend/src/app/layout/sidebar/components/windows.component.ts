import { NgOptimizedImage } from '@angular/common'
import { Component, effect, inject } from '@angular/core'
import { LucideDynamicIcon, LucideX } from '@lucide/angular'
import { L10nTranslateDirective } from 'angular-l10n'
import { AutoResizeDirective } from '../../../common/directives/auto-resize.directive'
import { AppWindow, TAB_MENU } from '../../layout.interfaces'
import { LayoutService } from '../../layout.service'

@Component({
  selector: 'app-windows',
  imports: [AutoResizeDirective, LucideDynamicIcon, L10nTranslateDirective, NgOptimizedImage],
  templateUrl: 'windows.component.html'
})
export class WindowsComponent {
  protected readonly icons = { LucideX }
  private readonly layout = inject(LayoutService)
  protected readonly windows = this.layout.windows

  constructor() {
    effect(() => this.hideIfNoWindows(this.windows()))
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
    this.hideIfNoWindows(this.layout.windows())
  }

  onCloseAll() {
    for (const w of this.layout.windows()) {
      const modal = this.layout.modalRefs.get(w.id)
      if (modal) {
        modal.content.onClose()
      }
    }
    this.hideIfNoWindows(this.layout.windows())
  }

  private hideIfNoWindows(windows: AppWindow[]) {
    if (!windows.length) {
      this.layout.hideRSideBarTab(TAB_MENU.WINDOWS, 1000)
    }
  }
}
