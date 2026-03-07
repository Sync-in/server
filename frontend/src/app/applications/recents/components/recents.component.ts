import { Component, inject } from '@angular/core'
import { AutoResizeDirective } from '../../../common/directives/auto-resize.directive'
import { LayoutService } from '../../../layout/layout.service'
import { CommentsRecentsWidgetComponent } from '../../comments/components/widgets/comments-recents-widget.component'
import { FilesRecentsWidgetComponent } from '../../files/components/widgets/files-recents-widget.component'
import { RECENTS_ICON, RECENTS_PATH, RECENTS_TITLE } from '../recents.constants'

@Component({
  selector: 'app-recents',
  imports: [AutoResizeDirective, FilesRecentsWidgetComponent, CommentsRecentsWidgetComponent],
  templateUrl: './recents.component.html'
})
export class RecentsComponent {
  private readonly layout = inject(LayoutService)

  constructor() {
    this.layout.setBreadcrumbIcon(RECENTS_ICON)
    this.layout.setBreadcrumbNav({ url: `/${RECENTS_PATH.BASE}/${RECENTS_TITLE}`, translating: true, sameLink: true })
  }
}
