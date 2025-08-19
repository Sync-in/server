/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpErrorResponse } from '@angular/common/http'
import { Component, computed, ElementRef, inject, OnDestroy, Signal, ViewChild } from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faEdit } from '@fortawesome/free-solid-svg-icons'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { Subscription } from 'rxjs'
import { AutofocusDirective } from '../../../../common/directives/auto-focus.directive'
import { AutoResizeDirective } from '../../../../common/directives/auto-resize.directive'
import { TimeAgoPipe } from '../../../../common/pipes/time-ago.pipe'
import { TimeDateFormatPipe } from '../../../../common/pipes/time-date-format.pipe'
import { LayoutService } from '../../../../layout/layout.service'
import { StoreService } from '../../../../store/store.service'
import { FileModel } from '../../../files/models/file.model'
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
    FaIconComponent,
    TimeDateFormatPipe,
    TimeAgoPipe,
    FormsModule,
    UserAvatarComponent
  ],
  templateUrl: 'comments-selection.component.html'
})
export class CommentsSelectionComponent implements OnDestroy {
  @ViewChild('CommentCreate', { static: true }) commentInput: ElementRef<HTMLInputElement>
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected comments: CommentModel[] = []
  protected readonly icons = { faEdit }
  private readonly store = inject(StoreService)
  protected file: Signal<FileModel> = computed(() => (this.store.filesSelection().length ? this.store.filesSelection()[0] : null))
  private readonly layout = inject(LayoutService)
  private readonly commentsService = inject(CommentsService)
  private subscriptions: Subscription[] = []

  constructor() {
    this.subscriptions.push(toObservable(this.file).subscribe((file: FileModel) => this.loadComments(file)))
  }

  ngOnDestroy() {
    this.subscriptions.forEach((sub: Subscription) => sub.unsubscribe())
  }

  onEditComment(comment: CommentModel) {
    if (!comment.isEdited) {
      this.comments.forEach((c) => (c.isEdited = false))
    }
    comment.isEdited = !comment.isEdited
  }

  loadComments(file: FileModel) {
    if (file && file.hasComments) {
      this.commentsService.getComments(this.file()).subscribe({
        next: (comments: CommentModel[]) => (this.comments = comments),
        error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Comments', 'Unable to load', e)
      })
    } else {
      this.comments = []
    }
  }

  postComment() {
    const content: string = this.commentInput.nativeElement.value
    this.commentsService.createComment(this.file(), { content: content, fileId: this.file().id }).subscribe({
      next: (c: CommentModel) => {
        this.comments.unshift(c)
        this.commentInput.nativeElement.value = ''
        this.file().id = c.fileId
        this.file().hasComments = !!this.comments.length
      },
      error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Comment', 'Unable to create', e)
    })
  }

  removeComment(comment: CommentModel) {
    this.commentsService.deleteComment(this.file(), { commentId: comment.id, fileId: this.file().id }).subscribe({
      next: () => {
        this.comments = this.comments.filter((c) => c.id !== comment.id)
        this.file().hasComments = !!this.comments.length
      },
      error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Comment', 'Unable to delete', e)
    })
  }

  updateComment(comment: CommentModel, content: string) {
    this.commentsService.updateComment(this.file(), { commentId: comment.id, fileId: this.file().id, content: content }).subscribe({
      next: (c: CommentModel) => {
        comment.isEdited = false
        Object.assign(comment, c)
      },
      error: (e: HttpErrorResponse) => {
        this.layout.sendNotification('error', 'Comment', 'Unable to update', e)
      }
    })
  }
}
