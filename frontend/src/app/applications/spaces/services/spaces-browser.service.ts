/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpClient, HttpErrorResponse } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { UrlSegment } from '@angular/router'
import { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { API_SPACES_BROWSE } from '@sync-in-server/backend/src/applications/spaces/constants/routes'
import { SPACE_REPOSITORY } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import type { SpaceFiles } from '@sync-in-server/backend/src/applications/spaces/interfaces/space-files.interface'
import { catchError, Observable, throwError } from 'rxjs'
import { tap } from 'rxjs/operators'
import { buildUrlFromRoutes, pathFromRoutes } from '../../../common/utils/functions'
import { BreadCrumbUrl } from '../../../layout/breadcrumb/breadcrumb.interfaces'
import { LayoutService } from '../../../layout/layout.service'
import { SPACES_ICON, SPACES_PATH, SPACES_TITLE } from '../spaces.constants'

@Injectable({ providedIn: 'root' })
export class SpacesBrowserService {
  private readonly http = inject(HttpClient)
  private readonly layout = inject(LayoutService)
  private browseApi: string
  private breadCrumbUrl: string
  private breadCrumbIcon: IconDefinition
  private breadCrumbFilesRepo = false
  private inShareRepo = false
  private inRootSpace = false
  public inPersonalSpace = false

  setEnvironment(repository: SPACE_REPOSITORY, routes: UrlSegment[]) {
    this.breadCrumbFilesRepo = SPACES_PATH.FILES === repository
    this.inPersonalSpace = routes.length && routes[0].path === SPACES_PATH.PERSONAL
    this.inShareRepo = repository === SPACES_PATH.SHARES
    this.inRootSpace = this.inShareRepo ? routes.length === 0 : routes.length === 1
    this.browseApi = buildUrlFromRoutes(`${API_SPACES_BROWSE}/${repository}`, routes, false)
    this.breadCrumbUrl = `/${SPACES_PATH.SPACES}/${repository}${pathFromRoutes(routes)}`
    this.breadCrumbIcon = this.inShareRepo
      ? SPACES_ICON.SHARED_WITH_ME
      : this.breadCrumbFilesRepo
        ? this.inPersonalSpace && this.breadCrumbFilesRepo
          ? SPACES_ICON.PERSONAL
          : SPACES_ICON.SPACES
        : SPACES_ICON.TRASH
  }

  loadFiles(): Observable<SpaceFiles> {
    return this.http.get<SpaceFiles>(this.browseApi).pipe(
      tap(() => {
        this.layout.setBreadcrumbIcon(this.breadCrumbIcon)
        this.layout.setBreadcrumbNav(this.breadcrumbNav())
      }),
      catchError((e: HttpErrorResponse) => {
        return throwError(() => e)
      })
    )
  }

  private breadcrumbNav(): BreadCrumbUrl {
    return {
      url:
        this.inPersonalSpace && this.inRootSpace
          ? `${this.breadCrumbUrl}/${SPACES_TITLE.SHORT_PERSONAL_FILES}`
          : this.inShareRepo && this.inRootSpace
            ? `${this.breadCrumbUrl}/${SPACES_TITLE.SHARED_WITH_ME}`
            : this.breadCrumbUrl,
      translating: this.inRootSpace && (this.inPersonalSpace || this.inShareRepo),
      sameLink: this.inRootSpace && (this.inPersonalSpace || this.inShareRepo),
      firstLink:
        this.inPersonalSpace && this.breadCrumbFilesRepo
          ? null
          : this.breadCrumbFilesRepo
            ? SPACES_PATH.SPACES
            : this.inShareRepo
              ? SPACES_PATH.SPACES_SHARES
              : SPACES_PATH.TRASH,
      mutateLevel:
        this.inPersonalSpace && !this.breadCrumbFilesRepo && !this.inRootSpace
          ? {
              0: {
                setTitle: SPACES_TITLE.PERSONAL_FILES,
                translateTitle: true
              }
            }
          : null,
      splicing: this.inPersonalSpace ? (!this.breadCrumbFilesRepo && !this.inRootSpace ? 2 : 3) : 2
    } satisfies BreadCrumbUrl
  }
}
