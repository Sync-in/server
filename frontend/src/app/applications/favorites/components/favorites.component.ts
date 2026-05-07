import { Component, inject } from '@angular/core'
import { AutoResizeDirective } from '../../../common/directives/auto-resize.directive'
import { LayoutService } from '../../../layout/layout.service'
import { FAVORITES_ICON, FAVORITES_PATH, FAVORITES_TITLE } from '../favorites.constants'
import { FilesFavoritesWidgetComponent } from './widgets/files-favorites-widget.component'

@Component({
  selector: 'app-favorites',
  imports: [AutoResizeDirective, FilesFavoritesWidgetComponent],
  templateUrl: './favorites.component.html'
})
export class FavoritesComponent {
  private readonly layout = inject(LayoutService)

  constructor() {
    this.layout.setBreadcrumbIcon(FAVORITES_ICON)
    this.layout.setBreadcrumbNav({ url: `/${FAVORITES_PATH.BASE}`, translating: true, sameLink: true })
  }
}
