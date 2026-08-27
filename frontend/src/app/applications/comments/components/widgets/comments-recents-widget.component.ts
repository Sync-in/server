import { Component, computed, inject, Signal } from '@angular/core'
import { Router } from '@angular/router'
import { LucideDynamicIcon, LucideMessageSquareMore, LucideZoomIn, LucideZoomOut } from '@lucide/angular'
import { L10nTranslateDirective } from 'angular-l10n'
import { LiveTimeAgoPipe } from '../../../../common/pipes/time-ago-live.pipe'
import { TAB_MENU } from '../../../../layout/layout.interfaces'
import { LayoutService } from '../../../../layout/layout.service'
import { StoreService } from '../../../../store/store.service'
import { FileLocationComponent } from '../../../files/components/utils/file-location.component'
import { SPACES_PATH } from '../../../spaces/spaces.constants'
import { UserAvatarComponent } from '../../../users/components/utils/user-avatar.component'
import { CommentRecentModel } from '../../models/comment-recent.model'
import { CommentsService } from '../../services/comments.service'

@Component({
  selector: 'app-comments-recents-widget',
  imports: [L10nTranslateDirective, LucideDynamicIcon, UserAvatarComponent, LiveTimeAgoPipe, FileLocationComponent],
  templateUrl: './comments-recents-widget.component.html',
  styleUrl: './comments-recents-widget.component.scss'
})
export class CommentsRecentsWidgetComponent {
  protected moreElements = false
  protected readonly icons = { LucideMessageSquareMore, LucideZoomIn, LucideZoomOut }
  private readonly router = inject(Router)
  private readonly layout = inject(LayoutService)
  private readonly store = inject(StoreService)
  private readonly commentsService = inject(CommentsService)
  private nbInitialComments = 10
  private nbComments = this.nbInitialComments
  protected comments: Signal<CommentRecentModel[]> = computed(() => this.store.commentsRecents().slice(0, this.nbComments))

  constructor() {
    this.load()
  }

  switchMore() {
    if (this.moreElements) {
      this.moreElements = false
      this.nbComments = this.nbInitialComments
    } else {
      this.moreElements = true
      this.nbComments *= 5
    }
    this.load()
  }

  goToFile(c: CommentRecentModel) {
    this.router
      .navigate([SPACES_PATH.SPACES, ...c.file.path.split('/')], { queryParams: { select: c.file.name } })
      .then(() => this.layout.showRSideBarTab(TAB_MENU.COMMENTS, true))
  }

  private load() {
    this.commentsService.loadRecents(this.nbComments)
  }
}
