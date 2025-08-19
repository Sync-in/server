/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import type { CreateOrUpdateShareDto } from '@sync-in-server/backend/src/applications/shares/dto/create-or-update-share.dto'
import type { ShareProps } from '@sync-in-server/backend/src/applications/shares/interfaces/share-props.interface'
import type { ShareChild } from '@sync-in-server/backend/src/applications/shares/models/share-child.model'
import {
  API_SPACES_LIST,
  API_SPACES_ROOT_CHECK,
  API_SPACES_TRASH_BINS_LIST,
  SPACES_ROUTE
} from '@sync-in-server/backend/src/applications/spaces/constants/routes'
import { SPACE_ALL_OPERATIONS } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import type { CreateOrUpdateSpaceDto } from '@sync-in-server/backend/src/applications/spaces/dto/create-or-update-space.dto'
import type { DeleteSpaceDto } from '@sync-in-server/backend/src/applications/spaces/dto/delete-space.dto'
import type { SearchSpaceDto } from '@sync-in-server/backend/src/applications/spaces/dto/search-space.dto'
import type { CheckRootExternalPathDto } from '@sync-in-server/backend/src/applications/spaces/dto/space-roots.dto'
import type { SpaceTrash } from '@sync-in-server/backend/src/applications/spaces/interfaces/space-trash.interface'
import type { SpaceProps } from '@sync-in-server/backend/src/applications/spaces/models/space-props.model'
import { map, Observable } from 'rxjs'
import { ShareLinkModel } from '../../links/models/share-link.model'
import { ShareModel } from '../../shares/models/share.model'
import { SpaceModel, SpaceRootModel } from '../models/space.model'

@Injectable({ providedIn: 'root' })
export class SpacesService {
  private readonly http = inject(HttpClient)
  listSpaces(): Observable<SpaceModel[]> {
    return this.http.get<SpaceProps[]>(API_SPACES_LIST).pipe(map((sps: SpaceProps[]) => sps.map((s: SpaceProps) => new SpaceModel(s))))
  }

  getSpace(spaceId: number): Observable<SpaceModel> {
    return this.http.get<SpaceProps>(`${SPACES_ROUTE.BASE}/${spaceId}`).pipe(map((s: SpaceProps) => new SpaceModel(s)))
  }

  getUserSpaceRoots(spaceId: number): Observable<SpaceRootModel[]> {
    return this.http.get<SpaceRootModel[]>(`${SPACES_ROUTE.BASE}/${spaceId}/${SPACES_ROUTE.ROOTS}`)
  }

  createUserSpaceRoots(spaceId: number, roots: Partial<SpaceRootModel>[]): Observable<SpaceRootModel[]> {
    return this.http.post<SpaceRootModel[]>(`${SPACES_ROUTE.BASE}/${spaceId}/${SPACES_ROUTE.ROOTS}`, roots)
  }

  updateUserSpaceRoots(spaceId: number, roots: Partial<SpaceRootModel>[]): Observable<SpaceRootModel[]> {
    return this.http.put<SpaceRootModel[]>(`${SPACES_ROUTE.BASE}/${spaceId}/${SPACES_ROUTE.ROOTS}`, roots)
  }

  updateSpace(space: CreateOrUpdateSpaceDto): Observable<SpaceModel | null> {
    return this.http.put<SpaceProps | null>(`${SPACES_ROUTE.BASE}/${space.id}`, space).pipe(map((s: SpaceProps) => (s ? new SpaceModel(s) : null)))
  }

  createSpace(space: CreateOrUpdateSpaceDto): Observable<SpaceModel> {
    return this.http.post<SpaceProps>(SPACES_ROUTE.BASE, space).pipe(
      map((s: SpaceProps) => {
        // only user with the admin space permission can create space, add all permissions only for ui
        s.permissions = SPACE_ALL_OPERATIONS
        return new SpaceModel(s)
      })
    )
  }

  deleteSpace(spaceId: number, options: DeleteSpaceDto): Observable<any> {
    return this.http.request('delete', `${SPACES_ROUTE.BASE}/${spaceId}`, { body: options })
  }

  searchSpaces(searchSpaceDto: SearchSpaceDto) {
    return this.http.request<SpaceProps[]>('search', SPACES_ROUTE.BASE, { body: searchSpaceDto })
  }

  listSpaceShares(spaceId: number): Observable<ShareChild[]> {
    return this.http.get<ShareChild[]>(`${SPACES_ROUTE.BASE}/${spaceId}/${SPACES_ROUTE.SHARES}`)
  }

  getSpaceShare(spaceId: number, shareId: number): Observable<ShareModel> {
    return this.http
      .get<ShareProps>(`${SPACES_ROUTE.BASE}/${spaceId}/${SPACES_ROUTE.SHARES}/${shareId}`)
      .pipe(map((s: ShareProps) => new ShareModel(s)))
  }

  updateSpaceShare(spaceId: number, share: CreateOrUpdateShareDto): Observable<ShareModel> {
    return this.http
      .put<ShareProps>(`${SPACES_ROUTE.BASE}/${spaceId}/${SPACES_ROUTE.SHARES}/${share.id}`, share)
      .pipe(map((s: ShareProps) => new ShareModel(s)))
  }

  deleteSpaceShare(spaceId: number, shareId: number): Observable<void> {
    return this.http.delete<void>(`${SPACES_ROUTE.BASE}/${spaceId}/${SPACES_ROUTE.SHARES}/${shareId}`)
  }

  getSpaceShareLink(spaceId: number, shareId: number): Observable<ShareLinkModel> {
    return this.http
      .get<ShareLinkModel>(`${SPACES_ROUTE.BASE}/${spaceId}/${SPACES_ROUTE.LINKS}/${shareId}`)
      .pipe(map((s: Partial<ShareLinkModel>) => new ShareLinkModel(s)))
  }

  listTrashBins(): Observable<SpaceTrash[]> {
    return this.http.get<SpaceTrash[]>(API_SPACES_TRASH_BINS_LIST)
  }

  checkSpaceRootPath(path: string) {
    return this.http.post(API_SPACES_ROOT_CHECK, { path: path } as CheckRootExternalPathDto)
  }
}
