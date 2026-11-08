import { HttpErrorResponse } from '@angular/common/http'
import { inject, Injectable, signal } from '@angular/core'
import { Title } from '@angular/platform-browser'
import type { LucideIcon } from '@lucide/angular'
import { ContextMenuComponent, ContextMenuService } from '@perfectmemory/ngx-contextmenu'
import { USER_THEME } from '@sync-in-server/backend/src/applications/users/constants/user-preferences'
import type { UserTheme } from '@sync-in-server/backend/src/applications/users/interfaces/user-preferences.interface'
import { L10nTranslationService } from 'angular-l10n'
import { BsModalRef, BsModalService, ModalContainerComponent, ModalOptions } from 'ngx-bootstrap/modal'
import { setTheme } from 'ngx-bootstrap/utils'
import { BehaviorSubject, fromEvent, mergeWith, Subject } from 'rxjs'
import { map } from 'rxjs/operators'
import { getBrowserL10nLocale, i18nLanguageText } from '../../i18n/l10n'
import { APP_NAME } from '../app.constants'
import { USER_LANGUAGE_AUTO } from '../applications/users/user.constants'
import type { ToastOptions, ToastRef, ToastType } from '../common/components/toast/interfaces/toast.interface'
import { ToastService } from '../common/components/toast/toast.service'
import { getTheme } from '../common/utils/functions'
import { EVENT } from '../electron/constants/events'
import { Electron } from '../electron/electron.service'
import { StoreService } from '../store/store.service'
import { BreadCrumbUrl } from './breadcrumb/breadcrumb.interfaces'
import { AppWindow, TAB_GROUP, TAB_MENU, TabMenu, themeDark, themeLight } from './layout.interfaces'

declare const window: any

interface ModalComponent extends ModalContainerComponent {
  id: string | number
}

@Injectable({ providedIn: 'root' })
export class LayoutService {
  public readonly currentRightSideBarTab = signal<string | null>(null)
  // Resize event
  public readonly resizeEvent = new BehaviorSubject<void | null>(null)
  public readonly switchTheme = signal<string>(getTheme(), { equal: () => false })
  // Toggle Left sidebar tabs (1: open / 2: collapse / 3: toggle)
  public readonly toggleLeftSideBar = new BehaviorSubject<number>(this.isSmallerMediumScreen() ? 2 : 1)
  // Left sidebar: save user action
  public readonly saveLeftSideBarIsOpen = signal(true, { equal: () => false })
  // Left sidebar: get status
  public readonly leftSideBarIsOpen = signal(true, { equal: () => false })
  // Imperative DOM command; keep event semantics, including repeated values.
  public readonly toggleRightSideBar = new Subject<boolean>()
  // Right sidebar / show / hide
  public readonly rightSideBarIsOpen = signal(false, { equal: () => false })
  public readonly rightSideBarOpenAndShowTab = new Subject<string | null>()
  // Right sidebar tabs
  public readonly rightSideBarSetTabs = new Subject<{ name: TAB_GROUP; tabs: TabMenu[] }>()
  // Right sidebar select tab
  public readonly rightSideBarSelectTab = new Subject<string | null>()
  // Used by the breadcrumb
  public readonly breadcrumbNav = signal<BreadCrumbUrl>({ url: '' }, { equal: () => false })
  // Navigation breadcrumb icon
  public readonly breadcrumbIcon = signal<LucideIcon>(null, { equal: () => false })
  // Modal section
  public readonly windows = signal<AppWindow[]>([], { equal: () => false }) // minimized modals
  public readonly modalRefs = new Map<number | string, BsModalRef>()
  public readonly collapseRSideBarPreference = signal(this.getAutoCollapseRSideBarPreference())
  public readonly themePreference = signal<USER_THEME>(USER_THEME.AUTO)
  // Services
  private readonly title = inject(Title)
  private readonly translation = inject(L10nTranslationService)
  private readonly bsModal = inject(BsModalService)
  private readonly toast = inject(ToastService)
  private readonly contextMenu = inject<ContextMenuService<any>>(ContextMenuService)
  private readonly electron = inject(Electron)
  private readonly store = inject(StoreService)
  // States
  private readonly screenMediumSize = 767 // px
  private collapseRSideBarTimeoutId: ReturnType<typeof setTimeout> | null = null
  private escapeCloseInProgress = false
  // Network events
  public readonly networkIsOnline = signal(navigator.onLine, { equal: () => false })
  private readonly networkStatusChanges = fromEvent(window, 'online').pipe(
    map(() => true),
    mergeWith(fromEvent(window, 'offline').pipe(map(() => false)))
  )
  private readonly preferredThemeChanges = fromEvent<MediaQueryListEvent>(window.matchMedia('(prefers-color-scheme: dark)'), 'change').pipe(
    map((event) => (event.matches ? themeDark : themeLight))
  )
  // Modal options
  private readonly modalOptions: ModalOptions = {
    animated: true,
    keyboard: true,
    backdrop: true,
    ignoreBackdropClick: true,
    closeInterceptor: (): Promise<void> => this.closeModalInterceptor()
  }

  constructor() {
    setTheme('bs5')
    this.title.setTitle(APP_NAME)
    this.networkStatusChanges.subscribe((online) => this.networkIsOnline.set(online))
    this.preferredThemeChanges.subscribe((theme) => {
      if (this.themePreference() === USER_THEME.AUTO) this.setTheme(theme)
    })
  }

  showRSideBarTab(tabName: TAB_MENU = null, tabVisible = false, delay: number = 0) {
    // show or collapse right sidebar
    if (tabVisible && this.rightSideBarIsOpen()) {
      this.rightSideBarSelectTab.next(tabName)
    } else {
      this.rightSideBarOpenAndShowTab.next(tabName)
    }
    if (delay > 0) {
      this.hideRSideBarTab(tabName, delay)
    }
  }

  hideRSideBarTab(tabName: string, delay: number = 0) {
    setTimeout(() => {
      if (this.currentRightSideBarTab() === tabName) {
        this.toggleRSideBar(false)
      }
    }, delay)
  }

  toggleRSideBar(show: boolean) {
    this.rightSideBarIsOpen.set(show)
    this.toggleRightSideBar.next(show)

    // Cancel the current timeout if it exists
    if (this.collapseRSideBarTimeoutId) {
      clearTimeout(this.collapseRSideBarTimeoutId)
      this.collapseRSideBarTimeoutId = null
    }
    if (show && this.collapseRSideBarPreference()) {
      this.collapseRSideBarTimeoutId = setTimeout(() => {
        if (!this.collapseRSideBarPreference()) return
        this.rightSideBarIsOpen.set(false)
        this.toggleRightSideBar.next(false)
        this.collapseRSideBarTimeoutId = null
      }, 10_000)
    }
  }

  setTabsRSideBar(name: TAB_GROUP, tabs?: TabMenu[]) {
    this.rightSideBarSetTabs.next({ name, tabs })
  }

  toggleLSideBar() {
    this.toggleLeftSideBar.next(3)
  }

  isSmallerMediumScreen() {
    return window.innerWidth !== 0 && window.innerWidth < this.screenMediumSize
  }

  getCurrentTheme(): UserTheme {
    return this.switchTheme() === themeDark ? USER_THEME.DARK : USER_THEME.LIGHT
  }

  openDialog(dialog: any, size: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'full', componentState: any = {}, override: ModalOptions = {}): BsModalRef {
    const dialogClass = `modal-${size || 'sm'} modal-primary`
    const modalRef = componentState.id ? this.modalRefs.get(componentState.id) : null
    if (modalRef && typeof dialog === 'function' && modalRef.content instanceof dialog) {
      if (this.activateDialog(componentState.id)) return modalRef
      this.modalRefs.delete(componentState.id)
    }
    const state: ModalOptions = Object.assign(componentState, { ...this.modalOptions, ...override }, { class: dialogClass })
    const createdModalRef = this.bsModal.show(dialog, state)
    this.modalRefs.set(createdModalRef.id, createdModalRef)
    return createdModalRef
  }

  minimizeDialog(modalId: any, element: { name: string; mimeUrl: string }): ModalComponent {
    const modal = this.getModalComponent(modalId)
    if (modal) {
      this.closeModalWithEffect(modal)
      if (!this.windows().find((m: AppWindow) => m.id === modalId)) {
        this.windows.update((windows) => [...windows, { id: modalId, element }])
      }
      if (this.windows().length === 1) {
        this.showRSideBarTab(TAB_MENU.WINDOWS, false, 3000)
      }
    }
    return modal
  }

  restoreDialog(modalId: any): ModalComponent {
    return this.activateDialog(modalId)
  }

  isDialogActive(id: number | string): boolean {
    return this.getLastOpenDialogId() === id
  }

  closeDialog(delay: number | null = null, id: number | string = null, all = false) {
    if (all) {
      this.bsModal.hide()
      this.modalRefs.clear()
      this.windows.set([])
      return
    }
    if (!id) {
      const lastOpenDialogId = this.getLastOpenDialogId()
      if (lastOpenDialogId !== null) {
        id = lastOpenDialogId
      } else {
        console.warn('Last modal id not found')
        return
      }
    }
    const modal = this.getModalComponent(id)
    this.modalRefs.delete(id)
    if (!modal) return
    if (delay) {
      setTimeout(() => this.closeModalWithEffect(modal, true), delay)
    } else {
      this.closeModalWithEffect(modal, true)
    }
    this.windows.update((windows) => windows.filter((m) => m.id !== id))
  }

  openContextMenu(event: any, component: ContextMenuComponent<any>) {
    this.closeContextMenu()
    setTimeout(() => this.contextMenu.show(component, event.type === 'contextmenu' ? event : event.srcEvent), 5)
  }

  closeContextMenu(): void {
    if (this.contextMenu.hasOpenMenu()) {
      this.contextMenu.closeAll()
    }
  }

  sendNotification(
    type: ToastType,
    title: string,
    message: string,
    e?: HttpErrorResponse,
    options: ToastOptions = {},
    forceLocal = false
  ): ToastRef | void {
    const useSystemNotifications = !forceLocal && this.electron.enabled && (this.store.user()?.preferences?.useSystemNotifications ?? true)
    if (type === 'error' && e) {
      const errorMessage = e.error
        ? Array.isArray(e.error.message)
          ? e.error.message.map((e: string) => this.translateString(e)).join(' & ')
          : this.translateString(e.error.message)
        : this.translateString(e.message || 'Unknown error !')
      if (useSystemNotifications) {
        this.electron.sendMessage(this.translateString(title), `${this.translateString(message)} - ${errorMessage}`)
        return
      }
      return this.toast.show(
        type,
        this.translateString(title),
        `<div class="fw-bold">${this.translateString(message)}</div><div class="mt-2">${errorMessage}</div>`,
        {
          ...options,
          enableHtml: true
        }
      )
    }
    if (useSystemNotifications) {
      this.electron.sendMessage(this.translateString(title), this.translateString(message))
    } else {
      return this.toast.show(type, this.translateString(title), this.translateString(message), options)
    }
  }

  setLanguage(language: string): Promise<void> {
    if (!language || language === USER_LANGUAGE_AUTO) {
      language = getBrowserL10nLocale().language
    }
    if (language && language !== this.getCurrentLanguage()) {
      return this.translation.setLocale({ language })
    }
    return Promise.resolve()
  }

  getCurrentLanguage(): string {
    return this.translation.getLocale().language
  }

  getLanguages(withAutoOption = false): string[] {
    const languages: string[] = Object.keys(i18nLanguageText)
    if (!withAutoOption) {
      // auto if no language defined by user
      return languages.filter((l: string) => l !== USER_LANGUAGE_AUTO)
    }
    return languages
  }

  setBreadcrumbIcon(icon: LucideIcon) {
    this.breadcrumbIcon.set(icon)
  }

  setBreadcrumbNav(url: BreadCrumbUrl) {
    this.breadcrumbNav.set(url)
  }

  openUrl(url: string) {
    if (this.electron.enabled) {
      this.electron.openUrl(url)
    } else {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  translateString(text: string, args?: any): string {
    return text ? this.translation.translate(text, args) : text
  }

  clean() {
    this.toggleRSideBar(false)
    this.closeDialog(null, null, true)
    this.setThemePreference(USER_THEME.AUTO)
  }

  setAutoCollapseRSideBarPreference(preference: boolean) {
    localStorage.setItem('autoCollapseRSideBar', preference ? 'on' : 'off')
    this.collapseRSideBarPreference.set(preference)
    if (preference) {
      this.toggleRSideBar(true)
    }
  }

  setThemePreference(theme: USER_THEME) {
    this.themePreference.set(theme)
    this.setTheme(theme === USER_THEME.AUTO ? getTheme() : theme === USER_THEME.DARK ? themeDark : themeLight)
  }

  private openModalWithEffect(modal: ModalComponent) {
    this.bsModal['_renderer'].setAttribute(modal['instance']._element.nativeElement, 'aria-hidden', 'false')
    this.bsModal['_renderer'].setStyle(modal['instance']._element.nativeElement, 'display', 'block')
    setTimeout(() => {
      this.bsModal['_renderer'].addClass(modal['instance']._element.nativeElement, 'show')
    }, 100)
  }

  private activateDialog(modalId: number | string): ModalComponent {
    const modal = this.getModalComponent(modalId)
    if (!modal) return null

    const element = modal['instance']._element.nativeElement as HTMLElement
    if (this.windows().some((window) => window.id === modalId)) {
      this.openModalWithEffect(modal)
      this.windows.update((windows) => windows.filter((window) => window.id !== modalId))
    }
    const modalRef = this.modalRefs.get(modalId)
    if (modalRef) {
      this.modalRefs.delete(modalId)
      this.modalRefs.set(modalId, modalRef)
    }
    if (element.parentElement) {
      this.bsModal['_renderer'].appendChild(element.parentElement, element)
    }
    queueMicrotask(() => {
      if (element.isConnected) element.focus({ preventScroll: true })
    })
    return modal
  }

  private closeModalWithEffect(modal: ModalComponent, hide = false) {
    this.bsModal['_renderer'].setAttribute(modal['instance']._element.nativeElement, 'aria-hidden', 'true')
    this.bsModal['_renderer'].removeClass(modal['instance']._element.nativeElement, 'show')
    setTimeout(() => this.bsModal['_renderer'].setStyle(modal['instance']._element.nativeElement, 'display', 'none'), 500)
    if (hide) {
      this.bsModal.hide(modal.id)
    }
  }

  private closeModalInterceptor(): Promise<void> {
    const reason = this.bsModal['lastDismissReason']
    if (reason == 'browser-back-navigation-clicked') {
      // Avoid browser navigation when a modal is open
      if (this.atLeastOneModalOpen()) {
        // Restore to initial route
        history.forward()
      }
      return Promise.reject('blocked-by-interceptor')
    } else if (reason === 'esc') {
      // Each modal listens to Escape. Closing one updates the modal count synchronously,
      // which can make the same event close the next modal as it continues propagating.
      if (!this.escapeCloseInProgress && this.atLeastOneModalOpen()) {
        this.escapeCloseInProgress = true
        queueMicrotask(() => (this.escapeCloseInProgress = false))
        // Manual closing to keep `modalRefs` up to date
        this.closeDialog()
      }
      return Promise.reject('blocked-by-interceptor')
    } else {
      // Allow closing in all other cases
      return Promise.resolve()
    }
  }

  private getModalComponent(modalId: number | string): ModalComponent {
    const modal: ModalComponent = this.bsModal['loaders'].find((loader: any) => loader.instance?.config.id === modalId)
    if (modal) {
      modal.id = modalId
      return modal
    }
    console.warn(`Modal ${modalId} not found`)
    return null
  }

  private getLastOpenDialogId(): number | string | null {
    let lastOpenDialogId: number | string | null = null
    const minimizedIds = new Set(this.windows().map((window) => window.id))
    for (const id of this.modalRefs.keys()) {
      if (!minimizedIds.has(id)) {
        lastOpenDialogId = id
      }
    }
    return lastOpenDialogId
  }

  private atLeastOneModalOpen(): boolean {
    return this.modalRefs.size - this.windows().length > 0
  }

  private setTheme(theme: string) {
    this.electron.send(EVENT.MISC.SWITCH_THEME, theme)
    this.switchTheme.set(theme)
  }

  private getAutoCollapseRSideBarPreference(): boolean {
    return localStorage.getItem('autoCollapseRSideBar') === 'on'
  }
}
