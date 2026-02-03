import { Component, computed, inject, Signal } from '@angular/core'
import { Router } from '@angular/router'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faCommentDots } from '@fortawesome/free-regular-svg-icons'
import { faMagnifyingGlassMinus, faMagnifyingGlassPlus, faTrashAlt } from '@fortawesome/free-solid-svg-icons'
import { L10nTranslateDirective } from 'angular-l10n'
import { TimeAgoPipe } from '../../../../common/pipes/time-ago.pipe'
import { TAB_MENU } from '../../../../layout/layout.interfaces'
import { LayoutService } from '../../../../layout/layout.service'
import { StoreService } from '../../../../store/store.service'
import { SPACES_PATH } from '../../../spaces/spaces.constants'
import { UserAvatarComponent } from '../../../users/components/utils/user-avatar.component'
import { CommentRecentModel } from '../../models/comment-recent.model'
import { CommentsService } from '../../services/comments.service'

@Component({
  selector: 'app-comments-recents-widget',
  imports: [L10nTranslateDirective, FaIconComponent, TimeAgoPipe, UserAvatarComponent],
  templateUrl: './comments-recents-widget.component.html'
})
export class CommentsRecentsWidgetComponent {
  protected moreElements = false
  protected readonly icons = { faCommentDots, faMagnifyingGlassPlus, faMagnifyingGlassMinus, faTrashAlt }
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
