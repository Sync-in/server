import { computed, inject, Injectable, signal } from '@angular/core'
import { NavigationEnd, Router } from '@angular/router'
import { MIN_CHARS_TO_SEARCH } from '@sync-in-server/backend/src/applications/files/constants/indexing'
import { filter, Subject } from 'rxjs'
import { SEARCH_PATH, SEARCH_QUERY_PARAM } from '../../../applications/search/search.constants'
import { StoreService } from '../../../store/store.service'
import {
  isNavbarGlobalSearchMode,
  NAVBAR_SEARCH_MODE,
  type NavbarGlobalSearch,
  type NavbarGlobalSearchMode
} from '../interfaces/navbar-search.interface'

@Injectable({ providedIn: 'root' })
export class NavbarSearchService {
  public readonly minimumCharacters = MIN_CHARS_TO_SEARCH
  private readonly modeState = signal<NAVBAR_SEARCH_MODE>(NAVBAR_SEARCH_MODE.NAME)
  private readonly queryState = signal('')
  private readonly viewFilterState = signal('')
  private readonly viewFilterEnabledState = signal(false)
  private readonly loadingState = signal(false)
  private readonly searchRouteActiveState = signal(false)
  private readonly focusRequestedSubject = new Subject<void>()
  private readonly refreshGlobalSearchSubject = new Subject<NavbarGlobalSearch>()
  private readonly router = inject(Router)
  private readonly store = inject(StoreService)
  private viewFilterTimeoutId: ReturnType<typeof setTimeout> | null = null

  public readonly mode = this.modeState.asReadonly()
  public readonly query = this.queryState.asReadonly()
  public readonly viewFilter = this.viewFilterState.asReadonly()
  public readonly viewFilterEnabled = this.viewFilterEnabledState.asReadonly()
  public readonly loading = this.loadingState.asReadonly()
  public readonly searchRouteActive = this.searchRouteActiveState.asReadonly()
  public readonly canSubmit = computed(() => isNavbarGlobalSearchMode(this.modeState()) && this.queryState().trim().length >= this.minimumCharacters)
  public readonly focusRequested = this.focusRequestedSubject.asObservable()
  public readonly refreshGlobalSearch = this.refreshGlobalSearchSubject.asObservable()

  constructor() {
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => this.synchronizeWithRoute())
    queueMicrotask(() => this.synchronizeWithRoute())
  }

  setQuery(query: string) {
    this.queryState.set(query)
    if (this.modeState() === NAVBAR_SEARCH_MODE.VIEW) {
      this.scheduleViewFilter(query)
    }
  }

  setMode(mode: NAVBAR_SEARCH_MODE) {
    if (mode === NAVBAR_SEARCH_MODE.VIEW && !this.viewFilterEnabledState()) {
      return
    }
    this.cancelScheduledViewFilter()
    this.modeState.set(mode)
    this.viewFilterState.set(mode === NAVBAR_SEARCH_MODE.VIEW ? this.queryState() : '')
  }

  async openMode(mode: NAVBAR_SEARCH_MODE): Promise<void> {
    this.setMode(mode)
    if (!isNavbarGlobalSearchMode(mode) || this.isSearchRoute()) return

    const cachedSearch = this.store.currentSearch()
    const cachedMode = cachedSearch.fullText ? NAVBAR_SEARCH_MODE.CONTENT : NAVBAR_SEARCH_MODE.NAME
    const cachedContent = cachedMode === mode ? cachedSearch.content.trim() : ''
    await this.router.navigate([`/${SEARCH_PATH.BASE}`], {
      queryParams: {
        [SEARCH_QUERY_PARAM.QUERY]: cachedContent.length >= this.minimumCharacters ? cachedContent : null,
        [SEARCH_QUERY_PARAM.SCOPE]: mode
      }
    })
  }

  async openLastSearch(): Promise<void> {
    const cachedSearch = this.store.currentSearch()
    const mode = cachedSearch.fullText ? NAVBAR_SEARCH_MODE.CONTENT : NAVBAR_SEARCH_MODE.NAME
    if (this.isSearchRoute()) {
      this.setMode(mode)
      if (cachedSearch.content.trim().length >= this.minimumCharacters) {
        this.queryState.set(cachedSearch.content)
      }
      return
    }
    await this.openMode(mode)
  }

  flushViewFilter() {
    if (this.modeState() !== NAVBAR_SEARCH_MODE.VIEW) return
    this.cancelScheduledViewFilter()
    this.viewFilterState.set(this.queryState())
  }

  clear() {
    this.cancelScheduledViewFilter()
    this.queryState.set('')
    this.viewFilterState.set('')
  }

  clearViewFilter() {
    this.cancelScheduledViewFilter()
    this.viewFilterState.set('')
    if (this.modeState() === NAVBAR_SEARCH_MODE.VIEW) {
      this.queryState.set('')
    }
  }

  setLoading(loading: boolean) {
    this.loadingState.set(loading)
  }

  requestFocus() {
    this.focusRequestedSubject.next()
  }

  async submitGlobalSearch(): Promise<void> {
    const mode = this.modeState()
    const content = this.queryState().trim()
    if (!isNavbarGlobalSearchMode(mode) || content.length < this.minimumCharacters) return

    this.queryState.set(content)
    const navigated = await this.router.navigate([`/${SEARCH_PATH.BASE}`], {
      queryParams: {
        [SEARCH_QUERY_PARAM.QUERY]: content,
        [SEARCH_QUERY_PARAM.SCOPE]: mode
      }
    })
    if (!navigated) {
      this.refreshGlobalSearchSubject.next({ content, mode })
    }
  }

  private synchronizeWithRoute() {
    let route = this.router.routerState.snapshot.root
    while (route.firstChild) route = route.firstChild

    const viewFilterEnabled = route.data['navbarViewSearch'] === true
    const isSearchRoute = route.routeConfig?.path === SEARCH_PATH.BASE
    const queryParams = this.router.parseUrl(this.router.url).queryParamMap
    const content = queryParams.get(SEARCH_QUERY_PARAM.QUERY)?.trim() ?? ''
    const routeMode = this.toGlobalMode(queryParams.get(SEARCH_QUERY_PARAM.SCOPE))

    this.cancelScheduledViewFilter()
    this.searchRouteActiveState.set(isSearchRoute)
    this.viewFilterEnabledState.set(viewFilterEnabled)
    this.viewFilterState.set('')

    if (isSearchRoute) {
      this.modeState.set(routeMode ?? NAVBAR_SEARCH_MODE.NAME)
      this.queryState.set(content)
      if (!content) {
        this.loadingState.set(false)
        queueMicrotask(() => this.requestFocus())
      }
      return
    }

    this.loadingState.set(false)
    this.modeState.set(viewFilterEnabled ? NAVBAR_SEARCH_MODE.VIEW : NAVBAR_SEARCH_MODE.NAME)
    this.queryState.set('')
  }

  private isSearchRoute(): boolean {
    let route = this.router.routerState.snapshot.root
    while (route.firstChild) route = route.firstChild
    return route.routeConfig?.path === SEARCH_PATH.BASE
  }

  private toGlobalMode(mode: string | null): NavbarGlobalSearchMode | null {
    if (mode === NAVBAR_SEARCH_MODE.NAME || mode === NAVBAR_SEARCH_MODE.CONTENT) return mode
    return null
  }

  private scheduleViewFilter(query: string) {
    this.cancelScheduledViewFilter()
    this.viewFilterTimeoutId = setTimeout(() => {
      if (this.modeState() === NAVBAR_SEARCH_MODE.VIEW) {
        this.viewFilterState.set(query)
      }
      this.viewFilterTimeoutId = null
    }, 300)
  }

  private cancelScheduledViewFilter() {
    if (this.viewFilterTimeoutId === null) return
    clearTimeout(this.viewFilterTimeoutId)
    this.viewFilterTimeoutId = null
  }
}
