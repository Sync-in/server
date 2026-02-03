import { HttpErrorResponse } from '@angular/common/http'
import { inject, Injectable, NgZone, signal, WritableSignal } from '@angular/core'
import { Title } from '@angular/platform-browser'
import { FaConfig } from '@fortawesome/angular-fontawesome'
import { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { ContextMenuComponent, ContextMenuService } from '@perfectmemory/ngx-contextmenu'
import { L10nTranslationService } from 'angular-l10n'
import { BsModalRef, BsModalService, ModalContainerComponent, ModalOptions } from 'ngx-bootstrap/modal'
import { setTheme } from 'ngx-bootstrap/utils'
import { ActiveToast, ToastrService } from 'ngx-toastr'
import { BehaviorSubject, fromEvent, mergeWith, Observable, Subject } from 'rxjs'
import { map } from 'rxjs/operators'
import { getBrowserL10nLocale, i18nLanguageText } from '../../i18n/l10n'
import { APP_NAME } from '../app.constants'
import { USER_LANGUAGE_AUTO } from '../applications/users/user.constants'
import { getTheme } from '../common/utils/functions'
import { EVENT } from '../electron/constants/events'
import { Electron } from '../electron/electron.service'
import { BreadCrumbUrl } from './breadcrumb/breadcrumb.interfaces'
import { AppWindow, TAB_GROUP, TAB_MENU, TabMenu, themeDark, themeLight } from './layout.interfaces'

declare const window: any

interface ModalComponent extends ModalContainerComponent {
  id: string | number
}

@Injectable({ providedIn: 'root' })
export class LayoutService {
  public currentRightSideBarTab: string | null = null
  // Resize event
  public resizeEvent = new BehaviorSubject<void | null>(null)
  public switchTheme = new BehaviorSubject<string>(sessionStorage.getItem('themeMode') || getTheme())
  // Toggle Left sidebar tabs (1: open / 2: collapse / 3: toggle)
  public toggleLeftSideBar = new BehaviorSubject<number>(this.isSmallerMediumScreen() ? 2 : 1)
  // Left sidebar: save user action
  public saveLeftSideBarIsOpen = new BehaviorSubject<boolean>(true)
  // Left sidebar: get status
  public leftSideBarIsOpen = new BehaviorSubject<boolean>(true)
  // Toggle Right sidebar show / hide
  public toggleRightSideBar = new Subject<boolean>()
  // Right sidebar / show / hide
  public rightSideBarIsOpen = new BehaviorSubject<boolean>(false)
  public rightSideBarOpenAndShowTab = new Subject<string | null>()
  // Right sidebar tabs
  public rightSideBarSetTabs = new Subject<{ name: TAB_GROUP; tabs: TabMenu[] }>()
  // Right sidebar select tab
  public rightSideBarSelectTab = new Subject<string | null>()
  // Used by the breadcrumb
  public breadcrumbNav = new BehaviorSubject<BreadCrumbUrl>({ url: '' })
  // Navigation breadcrumb icon
  public breadcrumbIcon = new BehaviorSubject<IconDefinition>(null)
  // Modal section
  public windows = new BehaviorSubject<AppWindow[]>([]) // minimized modals
  public modalRefs = new Map<number | string, BsModalRef>()
  public collapseRSideBarPreference: WritableSignal<boolean> = signal(this.getAutoCollapseRSideBarPreference())
  // Services
  private readonly title = inject(Title)
  private readonly ngZone = inject(NgZone)
  private readonly translation = inject(L10nTranslationService)
  private readonly faConfig = inject(FaConfig)
  private readonly bsModal = inject(BsModalService)
  private readonly toastr = inject(ToastrService)
  private readonly contextMenu = inject<ContextMenuService<any>>(ContextMenuService)
  private readonly electron = inject(Electron)
  // States
  private readonly screenMediumSize = 767 // px
  private readonly screenSmallSize = 576 // px
  private collapseRSideBarTimeoutId: ReturnType<typeof setTimeout> | null = null
  // Network events
  private _networkIsOnline = new BehaviorSubject<boolean>(navigator.onLine)
  public networkIsOnline: Observable<boolean> = this._networkIsOnline
    .asObservable()
    .pipe(mergeWith(fromEvent(window, 'online').pipe(map(() => true)), fromEvent(window, 'offline').pipe(map(() => false))))
  private preferTheme = fromEvent(window.matchMedia('(prefers-color-scheme: dark)'), 'change').pipe(
    map((e: any) => (e.matches ? themeDark : themeLight))
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
    this.faConfig.fixedWidth = true
    this.title.setTitle(APP_NAME)
    this.preferTheme.subscribe((theme) => this.setTheme(theme))
  }

  showRSideBarTab(tabName: TAB_MENU = null, tabVisible = false, delay: number = 0) {
    // show or collapse right sidebar
    if (tabVisible && this.rightSideBarIsOpen.getValue()) {
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
      if (this.currentRightSideBarTab === tabName) {
        this.toggleRSideBar(false)
      }
    }, delay)
  }

  toggleRSideBar(show: boolean) {
    this.rightSideBarIsOpen.next(show)
    this.toggleRightSideBar.next(show)

    // Cancel the current timeout if it exists
    if (this.collapseRSideBarTimeoutId) {
      clearTimeout(this.collapseRSideBarTimeoutId)
      this.collapseRSideBarTimeoutId = null
    }
    if (show && this.collapseRSideBarPreference()) {
      this.collapseRSideBarTimeoutId = setTimeout(() => {
        if (!this.collapseRSideBarPreference()) return
        this.rightSideBarIsOpen.next(false)
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

  isSmallerScreen() {
    return window.innerWidth !== 0 && window.innerWidth < this.screenSmallSize
  }

  toggleTheme() {
    this.setTheme(this.switchTheme.getValue() === themeLight ? themeDark : themeLight)
  }

  openDialog(dialog: any, size: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'full', componentState: any = {}, override: ModalOptions = {}): BsModalRef {
    const dialogClass = `modal-${size || 'sm'} modal-primary`
    if (componentState.id && this.windows.getValue().find((w: AppWindow) => w.id === componentState.id)) {
      this.restoreDialog(componentState.id)
      return this.modalRefs.get(componentState.id)
    }
    const state: ModalOptions = Object.assign(componentState, { ...this.modalOptions, ...override }, { class: dialogClass })
    const modalRef = this.bsModal.show(dialog, state)
    this.modalRefs.set(modalRef.id, modalRef)
    return modalRef
  }

  minimizeDialog(modalId: any, element: { name: string; mimeUrl: string }): ModalComponent {
    const modal = this.getModalComponent(modalId)
    if (modal) {
      this.closeModalWithEffect(modal)
      if (!this.windows.getValue().find((m: AppWindow) => m.id === modalId)) {
        this.windows.next([...this.windows.getValue(), { id: modalId, element }])
      }
      if (this.windows.getValue().length === 1) {
        this.showRSideBarTab(TAB_MENU.WINDOWS, false, 3000)
      }
    }
    return modal
  }

  restoreDialog(modalId: any): ModalComponent {
    const modal = this.getModalComponent(modalId)
    if (modal) {
      this.openModalWithEffect(modal)
      this.windows.next(this.windows.getValue().filter((m: AppWindow) => m.id !== modalId))
    }
    return modal
  }

  closeDialog(delay: number | null = null, id: number | string = null, all = false) {
    if (all) {
      this.bsModal.hide()
      this.modalRefs.clear()
      this.windows.next([])
      return
    }
    if (!id) {
      let last: string | number
      const minimizedIds: (string | number)[] = this.windows.getValue().map((w) => w.id)
      for (const value of this.modalRefs.keys()) {
        if (minimizedIds.indexOf(value) > -1) continue
        last = value
      }
      if (last !== undefined) {
        id = last
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
    this.windows.next(this.windows.getValue().filter((m) => m.id !== id))
  }

  openContextMenu(event: any, component: ContextMenuComponent<any>) {
    if (this.contextMenu.hasOpenMenu()) {
      this.contextMenu.closeAll()
    }
    setTimeout(() => this.contextMenu.show(component, event.type === 'contextmenu' ? event : event.srcEvent), 5)
  }

  sendNotification(
    type: 'success' | 'error' | 'info' | 'warning',
    title: string,
    message: string,
    e?: HttpErrorResponse,
    override: any = {}
  ): ActiveToast<any> | void {
    if (type === 'error' && e) {
      console.error(e)
      const errorMessage = e.error
        ? Array.isArray(e.error.message)
          ? e.error.message.map((e: string) => this.translateString(e)).join(' & ')
          : this.translateString(e.error.message)
        : e.message || 'Unknown error !'
      if (this.electron.enabled) {
        this.electron.sendMessage(this.translateString(title), `${this.translateString(message)} - ${errorMessage}`)
      } else {
        return this.toastr[type](`${this.translateString(message)}<br>${errorMessage}`, this.translateString(title), {
          ...override,
          enableHtml: true
        })
      }
    }
    if (this.electron.enabled) {
      this.electron.sendMessage(this.translateString(title), this.translateString(message))
    } else {
      return this.toastr[type](this.translateString(message), this.translateString(title), override)
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

  setBreadcrumbIcon(icon: IconDefinition) {
    this.breadcrumbIcon.next(icon)
  }

  setBreadcrumbNav(url: BreadCrumbUrl) {
    this.breadcrumbNav.next(url)
  }

  openUrl(url: string) {
    if (this.electron.enabled) {
      this.electron.openUrl(url)
    } else {
      window.open(url, '_blank')
    }
  }

  translateString(text: string, args?: any): string {
    return text ? this.translation.translate(text, args) : text
  }

  clean() {
    this.toggleRSideBar(false)
    this.closeDialog(null, null, true)
  }

  setAutoCollapseRSideBarPreference(preference: boolean) {
    localStorage.setItem('autoCollapseRSideBar', preference ? 'on' : 'off')
    this.collapseRSideBarPreference.set(preference)
    if (preference) {
      this.toggleRSideBar(true)
    }
  }

  private openModalWithEffect(modal: ModalComponent) {
    this.bsModal['_renderer'].setAttribute(modal['instance']._element.nativeElement, 'aria-hidden', 'false')
    this.bsModal['_renderer'].setStyle(modal['instance']._element.nativeElement, 'display', 'block')
    setTimeout(() => {
      this.bsModal['_renderer'].addClass(modal['instance']._element.nativeElement, 'show')
    }, 100)
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
      // Manual closing to keep `modalIds` up to date
      this.closeDialog()
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

  private atLeastOneModalOpen(): boolean {
    return this.modalRefs.size - this.windows.getValue().length > 0
  }

  private setTheme(theme: string) {
    this.electron.send(EVENT.MISC.SWITCH_THEME, theme)
    this.ngZone.run(() => this.switchTheme.next(theme))
    sessionStorage.setItem('themeMode', theme)
  }

  private getAutoCollapseRSideBarPreference(): boolean {
    return localStorage.getItem('autoCollapseRSideBar') === 'on'
  }
}
