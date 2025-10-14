/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { Router } from '@angular/router'
import type { FileSpace } from '@sync-in-server/backend/src/applications/files/interfaces/file-space.interface'
import { API_SHARES_LIST, SHARES_ROUTE } from '@sync-in-server/backend/src/applications/shares/constants/routes'
import type { CreateOrUpdateShareDto } from '@sync-in-server/backend/src/applications/shares/dto/create-or-update-share.dto'
import type { ShareFile } from '@sync-in-server/backend/src/applications/shares/interfaces/share-file.interface'
import type { ShareProps } from '@sync-in-server/backend/src/applications/shares/interfaces/share-props.interface'
import type { ShareChild } from '@sync-in-server/backend/src/applications/shares/models/share-child.model'
import { lastValueFrom, map, Observable, of } from 'rxjs'
import { pathSlice } from '../../../common/utils/functions'
import { FileModel } from '../../files/models/file.model'
import { ShareLinkModel } from '../../links/models/share-link.model'
import { SPACES_PATH } from '../../spaces/spaces.constants'
import { UserType } from '../../users/interfaces/user.interface'
import { ShareFileModel } from '../models/share-file.model'
import { ShareModel } from '../models/share.model'
import { getFilePath } from '../shares.functions'

@Injectable({ providedIn: 'root' })
export class SharesService {
  private readonly http = inject(HttpClient)
  private readonly router = inject(Router)

  getShare(shareId: number): Observable<ShareModel> {
    return this.http.get<ShareProps>(`${SHARES_ROUTE.BASE}/${shareId}`).pipe(map((s: ShareProps) => new ShareModel(s)))
  }

  createShare(share: CreateOrUpdateShareDto): Observable<ShareModel> {
    return this.http.post<ShareProps>(SHARES_ROUTE.BASE, share).pipe(map((s: ShareProps) => new ShareModel(s)))
  }

  updateShare(share: CreateOrUpdateShareDto): Observable<ShareModel> {
    return this.http.put<ShareProps>(`${SHARES_ROUTE.BASE}/${share.id}`, share).pipe(map((s: ShareProps) => new ShareModel(s)))
  }

  deleteShare(shareId: number): Observable<void> {
    return this.http.delete<void>(`${SHARES_ROUTE.BASE}/${shareId}`)
  }

  listShares(): Observable<ShareFile[]> {
    return this.http.get<ShareFile[]>(API_SHARES_LIST)
  }

  getShareChild(shareId: number, childId: number): Observable<ShareModel> {
    return this.http
      .get<ShareProps>(`${SHARES_ROUTE.BASE}/${shareId}/${SHARES_ROUTE.CHILDREN}/${childId}`)
      .pipe(map((s: ShareProps) => new ShareModel(s)))
  }

  updateShareChild(shareId: number, childId: number, share: CreateOrUpdateShareDto): Observable<ShareModel> {
    return this.http
      .put<ShareProps>(`${SHARES_ROUTE.BASE}/${shareId}/${SHARES_ROUTE.CHILDREN}/${childId}`, share)
      .pipe(map((s: ShareProps) => new ShareModel(s)))
  }

  deleteShareChild(shareId: number, childId: number): Observable<void> {
    return this.http.delete<void>(`${SHARES_ROUTE.BASE}/${shareId}/${SHARES_ROUTE.CHILDREN}/${childId}`)
  }

  listChildShares(shareId: number): Observable<ShareChild[]> {
    return this.http.get<ShareChild[]>(`${SHARES_ROUTE.BASE}/${shareId}/${SHARES_ROUTE.CHILDREN}`)
  }

  initShareFromFile(user: UserType, file: FileSpace & Pick<FileModel, 'root'>, isSharesRepo = false, inSharesList = false): [ShareModel, number] {
    let share: ShareModel
    let parentShareId: number = null
    const partialShare: Partial<ShareModel> = {
      id: 0,
      name: '',
      createdAt: new Date(),
      modifiedAt: new Date(),
      storageIndexing: true,
      enabled: true,
      ...(isSharesRepo ? { parent: { id: 0, ownerId: 0, alias: file.space.alias, name: file.space.name } } : {})
    }
    if (file) {
      if (inSharesList) {
        // if the file is a share, use parent id to create a child share
        parentShareId = file.root.id
      }
      let ownerId: number = null
      if (file?.root?.owner.login === user.login || !file?.space?.alias) {
        // if space root is owned by the same user, just use owner.id
        file.space = null
        ownerId = user.id
      }
      share = new ShareModel({
        ...partialShare,
        name: file.name,
        file: { ...file, path: inSharesList ? '.' : pathSlice(file.path, 2), ownerId: ownerId }
      })
    } else {
      share = new ShareModel(partialShare)
    }
    return [share, parentShareId]
  }

  goTo(share?: ShareFileModel | ShareLinkModel): Promise<boolean> {
    if (!share.id) return lastValueFrom(of(false))
    if (share.externalPath && !share.parent?.id) {
      return this.router.navigate([SPACES_PATH.SPACES_SHARES], { queryParams: { select: share.name } })
    } else if (share.parent?.id && !share.file?.id && share.file?.path.indexOf('/') === -1) {
      return this.router.navigate([SPACES_PATH.SPACES_SHARES], { queryParams: { select: share.parent.name } })
    } else {
      const [bPath, fileName] = getFilePath(share)
      return this.router.navigate([bPath], { queryParams: { select: fileName } })
    }
  }
}
