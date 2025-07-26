/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpErrorResponse } from '@angular/common/http'
import { Injectable, NgZone } from '@angular/core'
import { Title } from '@angular/platform-browser'
import { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { ContextMenuComponent, ContextMenuService } from '@perfectmemory/ngx-contextmenu'
import { getBrowserLanguage, L10nTranslationService } from 'angular-l10n'
import { BsLocaleService } from 'ngx-bootstrap/datepicker'
import { BsModalService } from 'ngx-bootstrap/modal'
import { BsModalRef } from 'ngx-bootstrap/modal/bs-modal-ref.service'
import { ActiveToast, ToastrService } from 'ngx-toastr'
import { BehaviorSubject, fromEvent, mergeWith, Observable, Subject } from 'rxjs'
import { map } from 'rxjs/operators'
import { i18nAsset } from '../../i18n/l10n'
import { APP_NAME } from '../app.constants'
import { USER_LANGUAGE_AUTO } from '../applications/users/user.constants'
import { getTheme } from '../common/utils/functions'
import { dJs } from '../common/utils/time'
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
  private modalIDS: (number | string)[] = []
  private readonly dialogConfig = { animated: true, keyboard: true, backdrop: true, ignoreBackdropClick: true }

  constructor(
    private readonly title: Title,
    private readonly ngZone: NgZone,
    private readonly translation: L10nTranslationService,
    private readonly bsLocale: BsLocaleService,
    private readonly bsModal: BsModalService,
    private readonly toastr: ToastrService,
    private readonly contextMenu: ContextMenuService<any>,
    private readonly electron: Electron
  ) {
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

  openDialog(dialog: any, size: 'sm' | 'md' | 'lg' | 'xl' | 'full' = 'md', componentStates: any = {}): BsModalRef {
    const dialogClass = `modal-${size} modal-primary`
    if (componentStates.id && this.minimizedWindows.getValue().find((w: AppWindow) => w.id === componentStates.id)) {
      return this.restoreDialog(componentStates.id)
    }
    const modalRef = this.bsModal.show(dialog, Object.assign(componentStates, this.dialogConfig, { class: dialogClass }))
    if (modalRef.id && this.modalIDS.indexOf(modalRef.id) === -1) {
      this.modalIDS.push(modalRef.id)
    }
    return modalRef
  }

  minimizeDialog(modalID: any, element: { name: string; mimeUrl: string }): BsModalRef<unknown> {
    const modal = this.getModal(modalID)
    if (modal) {
      this.bsModal['_renderer'].setAttribute(modal['instance']._element.nativeElement, 'aria-hidden', 'true')
      this.bsModal['_renderer'].removeClass(modal['instance']._element.nativeElement, 'show')
      setTimeout(() => this.bsModal['_renderer'].setStyle(modal['instance']._element.nativeElement, 'display', 'none'), 100)

      if (!this.minimizedWindows.getValue().find((m: AppWindow) => m.id === modalID)) {
        this.minimizedWindows.next([...this.minimizedWindows.getValue(), { id: modalID, element }])
      }
    }
    return modal
  }

  restoreDialog(modalID: any): BsModalRef<unknown> {
    const modal: BsModalRef<unknown> = this.getModal(modalID)
    if (modal) {
      this.bsModal['_renderer'].setAttribute(modal['instance']._element.nativeElement, 'aria-hidden', 'false')
      this.bsModal['_renderer'].setStyle(modal['instance']._element.nativeElement, 'display', 'block')
      setTimeout(() => {
        this.bsModal['_renderer'].addClass(modal['instance']._element.nativeElement, 'show')
      }, 100)
    }
    return modal
  }

  closeDialog(delay: number | null = null, id: any = null, all = false) {
    if (all) {
      this.bsModal.hide()
      this.modalIDS = []
    } else {
      if (id) {
        this.modalIDS = this.modalIDS.filter((mid) => mid !== id)
      } else {
        id = this.modalIDS.pop()
      }
      if (delay) {
        setTimeout(() => this.bsModal.hide(id), delay)
      } else {
        this.bsModal.hide(id)
      }
      this.minimizedWindows.next(this.minimizedWindows.getValue().filter((m) => m.id !== id))
    }
  }

  getModal(modalID: any): BsModalRef {
    return this.bsModal['loaders'].find((loader: any) => loader.instance?.config.id === modalID)
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

  setLanguage(language: string) {
    if (!language) {
      language = getBrowserLanguage('language') || ''
      language = language.split('-')[0]
    }
    if (language && language !== this.translation.getLocale().language) {
      this.translation.setLocale({ language }).then(() => {
        dJs.locale(language)
        this.bsLocale.use(language)
      })
    }
  }

  getCurrentLanguage() {
    return this.translation.getLocale().language
  }

  getLanguages(withAutoOption = false): string[] {
    const languages: string[] = Object.keys(i18nAsset)
    if (withAutoOption) {
      // auto if no language defined by user
      languages.unshift(USER_LANGUAGE_AUTO)
    }
    return languages
  }

  setBreadcrumbIcon(icon: IconDefinition) {
    this.breadcrumbIcon.next(icon)
  }

  setBreadcrumbNav(url: BreadCrumbUrl) {
    this.breadcrumbNav.next(url)
  }

  translateString(text: string, args?: any): string {
    return text ? this.translation.translate(text, args) : text
  }

  clean() {
    this.toggleRSideBar(false)
    this.closeDialog(null, null, true)
  }

  private setTheme(theme: string) {
    this.electron.send(EVENT.MISC.SWITCH_THEME, theme)
    this.ngZone.run(() => this.switchTheme.next(theme))
    sessionStorage.setItem('themeMode', theme)
  }
}
