import { HttpErrorResponse } from '@angular/common/http'
import { Component, effect, inject } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { ActivatedRoute, type ParamMap, Router } from '@angular/router'
import { LucideMapPin } from '@lucide/angular'
import { MIN_CHARS_TO_SEARCH } from '@sync-in-server/backend/src/applications/files/constants/indexing'
import type { SearchFilesDto } from '@sync-in-server/backend/src/applications/files/dto/file-operations.dto'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective } from 'angular-l10n'
import { merge, of } from 'rxjs'
import { catchError, finalize, map, switchMap, tap } from 'rxjs/operators'
import { AutoResizeDirective } from '../../../common/directives/auto-resize.directive'
import { TapDirective } from '../../../common/directives/tap.directive'
import { SearchFilterPipe } from '../../../common/pipes/search.pipe'
import { filterArray } from '../../../common/utils/functions'
import { LayoutService } from '../../../layout/layout.service'
import { NAVBAR_SEARCH_MODE, type NavbarGlobalSearch } from '../../../layout/navbar/interfaces/navbar-search.interface'
import { NavbarSearchService } from '../../../layout/navbar/services/navbar-search.service'
import { StoreService } from '../../../store/store.service'
import { FileLocationComponent } from '../../files/components/utils/file-location.component'
import { FileContentModel } from '../../files/models/file-content.model'
import { FilesService } from '../../files/services/files.service'
import { SPACES_PATH } from '../../spaces/spaces.constants'
import { SEARCH_ICON, SEARCH_PATH, SEARCH_QUERY_PARAM, SEARCH_TITLE } from '../search.constants'

@Component({
  selector: 'app-files-search',
  imports: [AutoResizeDirective, SearchFilterPipe, L10nTranslateDirective, TapDirective, FileLocationComponent],
  templateUrl: './search.component.html'
})
export class SearchComponent {
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly store = inject(StoreService)
  protected readonly navbarSearch = inject(NavbarSearchService)
  protected readonly icons = { LucideMapPin }
  protected errorMessage: string = null
  protected selectedId: number = null
  private readonly router = inject(Router)
  private readonly activatedRoute = inject(ActivatedRoute)
  private readonly layout = inject(LayoutService)
  private readonly filesService = inject(FilesService)

  constructor() {
    this.layout.setBreadcrumbIcon(SEARCH_ICON)
    this.updateBreadcrumb()

    effect(() => {
      this.navbarSearch.viewFilter()
      this.selectedId = null
    })

    merge(
      this.activatedRoute.queryParamMap.pipe(map((params) => ({ search: this.searchFromParams(params), reuseCache: true }))),
      this.navbarSearch.refreshGlobalSearch.pipe(map((search) => ({ search, reuseCache: false })))
    )
      .pipe(
        tap(({ search }) => {
          this.selectedId = null
          this.errorMessage = null
          this.updateBreadcrumb(search?.content)
          if (!search) {
            this.store.currentSearch.set({ content: '', fullText: false })
            this.navbarSearch.setLoading(false)
          }
        }),
        switchMap(({ search, reuseCache }) => {
          if (!search) return of({ files: [] as FileContentModel[], errorMessage: null, cachedSearch: null })

          const request: SearchFilesDto = {
            content: search.content,
            fullText: search.mode === NAVBAR_SEARCH_MODE.CONTENT
          }
          if (reuseCache && this.hasCachedSearch(request)) {
            return of({ files: this.store.filesSearch(), errorMessage: null, cachedSearch: request })
          }

          this.navbarSearch.setLoading(true)
          return this.filesService.search(request).pipe(
            map((files) => ({ files, errorMessage: null, cachedSearch: request })),
            catchError((error: HttpErrorResponse) =>
              of({ files: [] as FileContentModel[], errorMessage: this.searchErrorMessage(error), cachedSearch: null })
            ),
            finalize(() => this.navbarSearch.setLoading(false))
          )
        }),
        takeUntilDestroyed()
      )
      .subscribe(({ files, errorMessage, cachedSearch }) => {
        if (cachedSearch) {
          this.store.currentSearch.set(cachedSearch)
        } else if (errorMessage) {
          this.store.currentSearch.set({ content: '', fullText: false })
        }
        this.store.filesSearch.set(files)
        this.errorMessage = errorMessage
      })
  }

  protected goTo(file?: FileContentModel, index?: number) {
    if (!file) {
      const files = this.store.filesSearch()
      const query = this.navbarSearch.viewFilter()
      const visibleFiles = query ? filterArray(query, files) : files
      file = visibleFiles.find((_, fileIndex) => fileIndex === index)
    }
    if (!file) return
    this.router.navigate([SPACES_PATH.SPACES, ...file.path.split('/')], { queryParams: { select: file.name } }).catch(console.error)
  }

  private searchFromParams(params: ParamMap): NavbarGlobalSearch | null {
    const content = params.get(SEARCH_QUERY_PARAM.QUERY)?.trim() ?? ''
    const mode = params.get(SEARCH_QUERY_PARAM.SCOPE)
    if (content.length < MIN_CHARS_TO_SEARCH || (mode !== NAVBAR_SEARCH_MODE.NAME && mode !== NAVBAR_SEARCH_MODE.CONTENT)) {
      return null
    }
    return { content, mode }
  }

  private hasCachedSearch(search: SearchFilesDto): boolean {
    const cachedSearch = this.store.currentSearch()
    return cachedSearch.content === search.content && cachedSearch.fullText === search.fullText
  }

  private updateBreadcrumb(searchName?: string) {
    this.layout.setBreadcrumbNav({
      url: `/${SEARCH_PATH.BASE}/${SEARCH_TITLE}`,
      sameLink: true,
      mutateLevel: {
        0: {
          setTitle: searchName || SEARCH_TITLE,
          translateTitle: !searchName
        }
      }
    })
  }

  private searchErrorMessage(error: HttpErrorResponse): string {
    const message = error.error?.message ?? error.message
    return Array.isArray(message) ? message.join(' & ') : `${message}`
  }
}
