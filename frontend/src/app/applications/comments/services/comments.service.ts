/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { API_COMMENTS_FROM_SPACE, API_COMMENTS_RECENTS } from '@sync-in-server/backend/src/applications/comments/constants/routes'
import type { CreateOrUpdateCommentDto, DeleteCommentDto } from '@sync-in-server/backend/src/applications/comments/dto/comment.dto'
import type { CommentRecent } from '@sync-in-server/backend/src/applications/comments/interfaces/comment-recent.interface'
import type { Comment } from '@sync-in-server/backend/src/applications/comments/schemas/comment.interface'
import { map, Observable } from 'rxjs'
import { LayoutService } from '../../../layout/layout.service'
import { StoreService } from '../../../store/store.service'
import type { FileModel } from '../../files/models/file.model'
import { CommentRecentModel } from '../models/comment-recent.model'
import { CommentModel } from '../models/comment.model'

@Injectable({
  providedIn: 'root'
})
export class CommentsService {
  private readonly store = inject(StoreService)
  private readonly layout = inject(LayoutService)
  private readonly http = inject(HttpClient)

  getComments(file: FileModel): Observable<CommentModel[]> {
    return this.http.get<Comment[]>(`${API_COMMENTS_FROM_SPACE}/${file.path}`).pipe(map((cs) => cs.map((c) => new CommentModel(c))))
  }

  createComment(file: FileModel, createCommentDto: CreateOrUpdateCommentDto): Observable<CommentModel> {
    return this.http.post<Comment>(`${API_COMMENTS_FROM_SPACE}/${file.path}`, createCommentDto).pipe(map((c) => new CommentModel(c)))
  }

  updateComment(file: FileModel, updateCommentDto: CreateOrUpdateCommentDto): Observable<CommentModel> {
    return this.http.patch<Comment>(`${API_COMMENTS_FROM_SPACE}/${file.path}`, updateCommentDto).pipe(map((c) => new CommentModel(c)))
  }

  deleteComment(file: FileModel, deleteCommentDto: DeleteCommentDto): Observable<void> {
    return this.http.request<void>('delete', `${API_COMMENTS_FROM_SPACE}/${file.path}`, { body: deleteCommentDto })
  }

  loadRecents(limit: number) {
    this.http
      .get<CommentRecent[]>(API_COMMENTS_RECENTS, { params: new HttpParams().set('limit', limit) })
      .pipe(map((cs) => cs.map((c) => new CommentRecentModel(c))))
      .subscribe({
        next: (cs: CommentRecentModel[]) => {
          this.store.commentsRecents.update((comments) => [...cs, ...comments.slice(limit)])
        },
        error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Comments', 'Unable to load', e)
      })
  }
}
