import { Component, inject, output } from '@angular/core'
import { LucideDynamicIcon, LucideGrid2x2, LucideList } from '@lucide/angular'
import { L10nTranslateDirective } from 'angular-l10n'
import { BsDropdownModule } from 'ngx-bootstrap/dropdown'
import type { ViewMode, ViewModeKey } from './interfaces/view-mode.interface'
import { NavigationViewService } from './navigation-view.service'

export type { ViewMode } from './interfaces/view-mode.interface'

@Component({
  selector: 'app-navigation-view',
  templateUrl: 'navigation-view.component.html',
  styleUrls: ['navigation-view.component.scss'],
  imports: [BsDropdownModule, LucideDynamicIcon, L10nTranslateDirective]
})
export class NavigationViewComponent {
  readonly switchView = output<ViewMode>()
  protected readonly navigationView = inject(NavigationViewService)
  protected readonly icons = { LucideGrid2x2, LucideList }

  protected setView(view: ViewModeKey) {
    const selectedView = this.navigationView.setView(view)
    if (selectedView) this.switchView.emit(selectedView)
  }

  protected setGallerySize(event: Event) {
    const option = this.navigationView.galleryViewOptions[Number((event.target as HTMLInputElement).value)]
    if (option) this.setView(option.key)
  }

  protected selectGalleryMode() {
    const selectedView = this.navigationView.selectGalleryMode()
    if (selectedView) this.switchView.emit(selectedView)
  }
}
