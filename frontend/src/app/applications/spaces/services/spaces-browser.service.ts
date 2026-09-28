import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { UrlSegment } from '@angular/router'
import type { LucideIcon } from '@lucide/angular'
import { API_SPACES_BROWSE } from '@sync-in-server/backend/src/applications/spaces/constants/routes'
import { SPACE_REPOSITORY } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import type { SpaceFiles } from '@sync-in-server/backend/src/applications/spaces/interfaces/space-files.interface'
import { Observable, tap } from 'rxjs'
import { buildUrlFromRoutes, pathFromRoutes } from '../../../common/utils/functions'
import { BreadCrumbUrl } from '../../../layout/breadcrumb/breadcrumb.interfaces'
import { LayoutService } from '../../../layout/layout.service'
import { SPACES_ICON, SPACES_PATH, SPACES_TITLE } from '../spaces.constants'

@Injectable({ providedIn: 'root' })
export class SpacesBrowserService {
  public inPersonalSpace = false
  private readonly http = inject(HttpClient)
  private readonly layout = inject(LayoutService)
  private browseApi: string
  private breadCrumbUrl: string
  private breadCrumbIcon: LucideIcon
  private breadCrumbFilesRepo = false
  private inShareRepo = false
  private inRootShare = false

  setEnvironment(repository: SPACE_REPOSITORY, routes: UrlSegment[]) {
    this.breadCrumbFilesRepo = SPACES_PATH.FILES === repository
    this.inPersonalSpace = routes[0]?.path === SPACES_PATH.PERSONAL
    this.inShareRepo = repository === SPACES_PATH.SHARES
    this.inRootShare = this.inShareRepo && routes.length === 0
    this.browseApi = buildUrlFromRoutes(`${API_SPACES_BROWSE}/${repository}`, routes, false)
    this.breadCrumbUrl = `/${SPACES_PATH.SPACES}/${repository}${pathFromRoutes(routes)}`
    this.breadCrumbIcon = this.inShareRepo
      ? SPACES_ICON.SHARED_WITH_ME
      : this.breadCrumbFilesRepo
        ? this.inPersonalSpace
          ? SPACES_ICON.PERSONAL
          : SPACES_ICON.SPACES
        : SPACES_ICON.TRASH
  }

  loadFiles(): Observable<SpaceFiles> {
    return this.http.get<SpaceFiles>(this.browseApi).pipe(
      tap((spaceFiles) => {
        this.layout.setBreadcrumbIcon(this.breadCrumbIcon)
        this.layout.setBreadcrumbNav(this.breadcrumbNav(spaceFiles.space.name))
      })
    )
  }

  private breadcrumbNav(spaceName: string): BreadCrumbUrl {
    const mutateLevel: NonNullable<BreadCrumbUrl['mutateLevel']> = {}
    const personalLevel = { setTitle: SPACES_TITLE.PERSONAL_SPACE, translateTitle: true }
    const inPersonalFiles = this.breadCrumbFilesRepo && this.inPersonalSpace
    const rootLink = this.inShareRepo
      ? SPACES_PATH.SPACES_SHARES
      : inPersonalFiles
        ? SPACES_PATH.PERSONAL_FILES
        : this.breadCrumbFilesRepo
          ? SPACES_PATH.SPACES
          : SPACES_PATH.TRASH
    if (inPersonalFiles) {
      mutateLevel[0] = personalLevel
    } else if (!this.inRootShare) {
      mutateLevel[0] = {
        setTitle: this.inShareRepo ? SPACES_TITLE.SHARED_WITH_ME : this.breadCrumbFilesRepo ? SPACES_TITLE.COLLABORATIVE_SPACES : SPACES_TITLE.TRASH,
        translateTitle: true
      }
      if (this.inPersonalSpace) mutateLevel[1] = personalLevel
      else if (spaceName) mutateLevel[1] = { setTitle: spaceName }
    }
    return {
      url: this.inRootShare ? `${this.breadCrumbUrl}/${SPACES_TITLE.SHARED_WITH_ME}` : this.breadCrumbUrl,
      translating: this.inRootShare,
      sameLink: this.inRootShare,
      firstLink: rootLink,
      mutateLevel,
      splicing: this.inRootShare || inPersonalFiles ? 2 : 1
    } satisfies BreadCrumbUrl
  }
}
