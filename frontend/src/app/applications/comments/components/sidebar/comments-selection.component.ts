import { HttpErrorResponse } from '@angular/common/http'
import { Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core'
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { LucideDynamicIcon, LucideSquarePen } from '@lucide/angular'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { AutofocusDirective } from '../../../../common/directives/auto-focus.directive'
import { AutoResizeDirective } from '../../../../common/directives/auto-resize.directive'
import { TimeAgoPipe } from '../../../../common/pipes/time-ago.pipe'
import { TimeDateFormatPipe } from '../../../../common/pipes/time-date-format.pipe'
import { LayoutService } from '../../../../layout/layout.service'
import { StoreService } from '../../../../store/store.service'
import { FileModel } from '../../../files/models/file.model'
import { FilesService } from '../../../files/services/files.service'
import { UserAvatarComponent } from '../../../users/components/utils/user-avatar.component'
import { CommentModel } from '../../models/comment.model'
import { CommentsService } from '../../services/comments.service'

@Component({
  selector: 'app-comments-selection',
  imports: [
    AutofocusDirective,
    L10nTranslateDirective,
    AutoResizeDirective,
    L10nTranslatePipe,
    LucideDynamicIcon,
    TimeDateFormatPipe,
    TimeAgoPipe,
    FormsModule,
    UserAvatarComponent
  ],
  templateUrl: 'comments-selection.component.html'
})
export class CommentsSelectionComponent {
  readonly commentInput = viewChild.required<ElementRef<HTMLInputElement>>('CommentCreate')
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly comments = signal<CommentModel[]>([])
  protected readonly icons = { LucideSquarePen }
  private readonly store = inject(StoreService)
  protected readonly file = computed(() => (this.store.filesSelection().length ? this.store.filesSelection()[0] : null))
  private readonly layout = inject(LayoutService)
  private readonly commentsService = inject(CommentsService)
  private readonly filesService = inject(FilesService)
  constructor() {
    toObservable(this.file)
      .pipe(takeUntilDestroyed())
      .subscribe((file: FileModel | null) => this.loadComments(file))
  }

  onEditComment(comment: CommentModel) {
    if (!comment.isEdited) {
      this.comments().forEach((c) => (c.isEdited = false))
    }
    comment.isEdited = !comment.isEdited
    this.comments.set([...this.comments()])
  }

  loadComments(file: FileModel | null) {
    if (file?.hasComments) {
      this.commentsService.getComments(this.file()!).subscribe({
        next: (comments: CommentModel[]) => this.comments.set(comments),
        error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Comments', 'Unable to load', e)
      })
    } else {
      this.comments.set([])
    }
  }

  postComment() {
    const content: string = this.commentInput().nativeElement.value
    this.commentsService.createComment(this.file()!, { content: content, fileId: this.file()!.id }).subscribe({
      next: (c: CommentModel) => {
        this.comments.update((comments) => [c, ...comments])
        this.commentInput().nativeElement.value = ''
        const file = this.file()!
        const hasComments = !!this.comments().length
        const fileChanged = file.id !== c.fileId || file.hasComments !== hasComments
        file.id = c.fileId
        file.hasComments = hasComments
        if (fileChanged) this.filesService.notifyFileCommentsChange(file)
        this.store.filesSelection.update((files) => [...files])
      },
      error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Comment', 'Unable to create', e)
    })
  }

  removeComment(comment: CommentModel) {
    this.commentsService.deleteComment(this.file()!, { commentId: comment.id, fileId: this.file()!.id }).subscribe({
      next: () => {
        this.comments.update((comments) => comments.filter((c) => c.id !== comment.id))
        const file = this.file()!
        const hasComments = !!this.comments().length
        const fileChanged = file.hasComments !== hasComments
        file.hasComments = hasComments
        if (fileChanged) this.filesService.notifyFileCommentsChange(file)
        this.store.filesSelection.update((files) => [...files])
      },
      error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Comment', 'Unable to delete', e)
    })
  }

  updateComment(comment: CommentModel, content: string) {
    this.commentsService.updateComment(this.file()!, { commentId: comment.id, fileId: this.file()!.id, content: content }).subscribe({
      next: (c: CommentModel) => {
        comment.isEdited = false
        Object.assign(comment, c)
        this.comments.set([...this.comments()])
      },
      error: (e: HttpErrorResponse) => {
        this.layout.sendNotification('error', 'Comment', 'Unable to update', e)
      }
    })
  }
}
