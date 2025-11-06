/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpErrorResponse } from '@angular/common/http'
import { inject, Injectable, NgZone } from '@angular/core'
import { Title } from '@angular/platform-browser'
import { FaConfig } from '@fortawesome/angular-fontawesome'
import { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { ContextMenuComponent, ContextMenuService } from '@perfectmemory/ngx-contextmenu'
import { L10nTranslationService } from 'angular-l10n'
import { BsModalRef, BsModalService, ModalOptions } from 'ngx-bootstrap/modal'
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
import { AppWindow, TAB_GROUP, TabMenu, themeDark, themeLight } from './layout.interfaces'

declare const window: any

@Injectable({ providedIn: 'root' })
export class LayoutService {
  public currentRightSideBarTab: string | null = null
  // Resize event
  public resizeEvent = new BehaviorSubject<void | null>(null)
  public switchTheme = new BehaviorSubject<string>(sessionStorage.getItem('themeMode') || getTheme())
  // Toggle Left sidebar tabs (1: open / 2: collapse / 3: toggle)
  public toggleLeftSideBar = new BehaviorSubject<number>(this.isSmallerMediumScreen() ? 2 : 1)
  // Left sidebar : save user action
  public saveLeftSideBarIsOpen = new BehaviorSubject<boolean>(true)
  // Left sidebar : get status
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
  public minimizedWindows = new BehaviorSubject<AppWindow[]>([])
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
  // Network events
  private _networkIsOnline = new BehaviorSubject<boolean>(navigator.onLine)
  public networkIsOnline: Observable<boolean> = this._networkIsOnline
    .asObservable()
    .pipe(mergeWith(fromEvent(window, 'online').pipe(map(() => true)), fromEvent(window, 'offline').pipe(map(() => false))))
  private preferTheme = fromEvent(window.matchMedia('(prefers-color-scheme: dark)'), 'change').pipe(
    map((e: any) => (e.matches ? themeDark : themeLight))
  )
  // Modal section
  private modalIDS = new Set<number | string>()
  private readonly dialogConfig: ModalOptions = {
    animated: true,
    keyboard: false,
    backdrop: true,
    focus: true,
    ignoreBackdropClick: true,
    closeInterceptor: () => {
      if (this.bsModal['lastDismissReason'] !== 'browser-back-navigation-clicked') {
        // allow to close for other cases
        return Promise.resolve()
      }
      // avoid browser navigation when a modal is open
      if (this.atLeastOneModalOpen()) {
        // back to initial route
        history.forward()
      }
      return Promise.reject('blocked-by-interceptor')
    }
  }

  constructor() {
    setTheme('bs5')
    this.faConfig.fixedWidth = true
    this.title.setTitle(APP_NAME)
    this.preferTheme.subscribe((theme) => this.setTheme(theme))
  }

  showRSideBarTab(tabName: string | null = null, tabVisible = false) {
    // show or collapse right sidebar
    if (tabVisible && this.rightSideBarIsOpen.getValue()) {
      this.rightSideBarSelectTab.next(tabName)
    } else {
      this.rightSideBarOpenAndShowTab.next(tabName)
    }
  }

  hideRSideBarTab(tabName: string) {
    if (this.currentRightSideBarTab === tabName) {
      this.toggleRSideBar(false)
    }
  }

  toggleRSideBar(show: boolean) {
    this.rightSideBarIsOpen.next(show)
    this.toggleRightSideBar.next(show)
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

  openDialog(dialog: any, size: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'full', componentStates: any = {}, override: ModalOptions = {}): BsModalRef {
    const dialogClass = `modal-${size || 'sm'} modal-primary`
    if (componentStates.id && this.minimizedWindows.getValue().find((w: AppWindow) => w.id === componentStates.id)) {
      return this.restoreDialog(componentStates.id)
    }
    const modalRef = this.bsModal.show(dialog, Object.assign(componentStates, { ...this.dialogConfig, ...override }, { class: dialogClass }))
    this.modalIDS.add(modalRef.id)
    return modalRef
  }

  minimizeDialog(modalID: any, element: { name: string; mimeUrl: string }): BsModalRef<unknown> {
    const modal = this.getModal(modalID)
    if (modal) {
      this.closeModalWithEffect(modal)
      if (!this.minimizedWindows.getValue().find((m: AppWindow) => m.id === modalID)) {
        this.minimizedWindows.next([...this.minimizedWindows.getValue(), { id: modalID, element }])
      }
    }
    return modal
  }

  restoreDialog(modalID: any): BsModalRef<unknown> {
    const modal: BsModalRef<unknown> = this.getModal(modalID)
    if (modal) {
      this.openModalWithEffect(modal)
      this.minimizedWindows.next(this.minimizedWindows.getValue().filter((m: AppWindow) => m.id !== modalID))
    }
    return modal
  }

  closeDialog(delay: number | null = null, id: number | string = null, all = false) {
    if (all) {
      this.bsModal.hide()
      this.modalIDS.clear()
      this.minimizedWindows.next([])
      return
    }
    if (!id) {
      let last: string | number
      for (const value of this.modalIDS) {
        last = value
      }
      if (last !== undefined) {
        id = last
      } else {
        console.warn('Last modal id not found')
        return
      }
    }
    this.modalIDS.delete(id)
    const modal: BsModalRef<unknown> = this.getModal(id)
    if (!modal) return
    if (delay) {
      setTimeout(() => this.closeModalWithEffect(modal, true), delay)
    } else {
      this.closeModalWithEffect(modal, true)
    }
    this.minimizedWindows.next(this.minimizedWindows.getValue().filter((m) => m.id !== id))
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

  private openModalWithEffect(modal: BsModalRef<unknown>) {
    this.bsModal['_renderer'].setAttribute(modal['instance']._element.nativeElement, 'aria-hidden', 'false')
    this.bsModal['_renderer'].setStyle(modal['instance']._element.nativeElement, 'display', 'block')
    setTimeout(() => {
      this.bsModal['_renderer'].addClass(modal['instance']._element.nativeElement, 'show')
    }, 100)
  }

  private closeModalWithEffect(modal: BsModalRef<unknown>, hide = false) {
    this.bsModal['_renderer'].setAttribute(modal['instance']._element.nativeElement, 'aria-hidden', 'true')
    this.bsModal['_renderer'].removeClass(modal['instance']._element.nativeElement, 'show')
    setTimeout(() => this.bsModal['_renderer'].setStyle(modal['instance']._element.nativeElement, 'display', 'none'), 500)
    if (hide) {
      this.bsModal.hide(modal.id)
    }
  }

  private getModal(modalID: any): BsModalRef {
    const modal = this.bsModal['loaders'].find((loader: any) => loader.instance?.config.id === modalID)
    if (modal) {
      modal.id = modalID
      return modal
    }
    console.warn(`Modal ${modalID} not found`)
    return null
  }

  private atLeastOneModalOpen(): boolean {
    return this.modalIDS.size - this.minimizedWindows.getValue().length > 0
  }

  private setTheme(theme: string) {
    this.electron.send(EVENT.MISC.SWITCH_THEME, theme)
    this.ngZone.run(() => this.switchTheme.next(theme))
    sessionStorage.setItem('themeMode', theme)
  }
}
