/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { AsyncPipe, Location, NgComponentOutlet, NgTemplateOutlet } from '@angular/common'
import { Component, ElementRef, inject, OnDestroy, Renderer2, ViewChild } from '@angular/core'
import { ResolveEnd, Router, RouterLink } from '@angular/router'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faAngleLeft, faAngleRight, faUserSecret } from '@fortawesome/free-solid-svg-icons'
import { L10nTranslateDirective } from 'angular-l10n'
import { Subscription } from 'rxjs'
import { filter } from 'rxjs/operators'
import { APP_MENU, APP_NAME, APP_VERSION } from '../../app.constants'
import { ADMIN_MENU } from '../../applications/admin/admin.constants'
import { logoIconUrl } from '../../applications/files/files.constants'
import { SEARCH_MENU } from '../../applications/search/search.constants'
import { SPACES_MENU } from '../../applications/spaces/spaces.constants'
import { SYNC_MENU } from '../../applications/sync/sync.constants'
import { USER_MENU } from '../../applications/users/user.constants'
import { UserService } from '../../applications/users/user.service'
import { AuthService } from '../../auth/auth.service'
import { AutoResizeDirective } from '../../common/directives/auto-resize.directive'
import { sortCollectionByType } from '../../common/utils/sort'
import { StoreService } from '../../store/store.service'
import { AppMenu } from '../layout.interfaces'
import { LayoutService } from '../layout.service'

@Component({
  selector: 'app-sidebar-left',
  templateUrl: 'sidebar.left.component.html',
  imports: [RouterLink, FaIconComponent, AutoResizeDirective, L10nTranslateDirective, NgComponentOutlet, AsyncPipe, NgTemplateOutlet]
})
export class SideBarLeftComponent implements OnDestroy {
  @ViewChild('sidebar', { static: true }) sidebar: ElementRef
  protected readonly store = inject(StoreService)
  protected readonly icons = { faAngleLeft, faAngleRight, faUserSecret }
  protected logoIconUrl = logoIconUrl
  protected appName: string
  protected appVersion: string
  protected leftSideBarIsOpen = false
  protected dynamicTitle: string
  protected currentUrl: string
  protected currentMenu: AppMenu
  protected appsMenu: AppMenu = APP_MENU
  private readonly router = inject(Router)
  private readonly renderer = inject(Renderer2)
  private readonly location = inject(Location)
  private readonly authService = inject(AuthService)
  private readonly layout = inject(LayoutService)
  private readonly userService = inject(UserService)
  private subscriptions: Subscription[] = []
  private menuAppsHovered = false
  private menuIconsHovered = false
  private menuAppsHoveredTimeout: ReturnType<typeof setTimeout> = null
  private menuIconsStopPropagation = false

  constructor() {
    this.appName = APP_NAME
    this.appVersion = APP_VERSION
    this.appsMenu.submenus = [SPACES_MENU, SEARCH_MENU, SYNC_MENU, USER_MENU, ADMIN_MENU]
    sortCollectionByType('number', this.appsMenu.submenus, 'level', true)
    this.subscriptions.push(this.store.user.pipe(filter((u) => !!u)).subscribe(() => this.loadMenus()))
    this.subscriptions.push(this.layout.leftSideBarIsOpen.subscribe((isOpen) => (this.leftSideBarIsOpen = isOpen)))
    this.subscriptions.push(
      this.router.events.pipe(filter((ev) => ev instanceof ResolveEnd)).subscribe((ev: any) => this.updateUrl(ev.urlAfterRedirects))
    )
  }

  ngOnDestroy() {
    this.subscriptions.forEach((s) => s.unsubscribe())
  }

  loadMenus() {
    this.userService.setMenusVisibility(this.appsMenu.submenus)
    this.updateUrl(this.router.url)
  }

  logOut() {
    this.authService.logout(true)
  }

  navigateTo(action: string) {
    if (action === 'back') {
      this.location.back()
    } else {
      this.location.forward()
    }
  }

  toggleSideBar() {
    for (const m of this.appsMenu.submenus) {
      m.miniOpened = false
    }
    if (this.leftSideBarIsOpen) {
      this.renderer.removeStyle(this.sidebar.nativeElement, 'z-index')
    }
    this.layout.toggleLSideBar()
  }

  checkMenuContext(menu: AppMenu) {
    if (!this.leftSideBarIsOpen && this.layout.isSmallerScreen() && menu.submenus?.length) {
      this.onHoverIconsMenu(!menu.miniOpened, menu)
    } else {
      this.navigateToUrl([menu.link])
    }
  }

  onMiniMenuNavigate(ev: MouseEvent, url: string[], menu: AppMenu = null) {
    ev.stopPropagation()
    this.navigateToUrl(url, menu)
  }

  checkComponentRoute(menu?: AppMenu) {
    if (this.currentMenu.link !== this.currentUrl) {
      this.router.navigate([this.currentMenu.link]).catch(console.error)
    }
    if (menu) {
      menu.miniOpened = false
    }
  }

  onHoverAppsMenu(state: boolean) {
    if (this.leftSideBarIsOpen) {
      this.menuAppsHovered = state
      if (state) {
        this.menuAppsHoveredTimeout = setTimeout(() => this.setActiveMenu(), 5000)
      } else {
        clearTimeout(this.menuAppsHoveredTimeout)
        this.checkHoveredMenu()
      }
    }
  }

  onHoverIconsMenu(state: boolean, menu: AppMenu | any, ignoreCollapse = false) {
    if (this.leftSideBarIsOpen && this.menuIconsStopPropagation) {
      return
    }
    if ((state && menu.submenus?.length) || menu.component) {
      this.currentMenu = menu
    }
    if (this.leftSideBarIsOpen || ignoreCollapse) {
      this.menuIconsHovered = state
      if (state) {
        this.updateDynamicTitle(menu.title)
      } else {
        this.checkHoveredMenu()
      }
    } else {
      if (state) {
        this.renderer.setStyle(this.sidebar.nativeElement, 'z-index', '1030')
      } else {
        this.renderer.removeStyle(this.sidebar.nativeElement, 'z-index')
      }
      for (const m of this.appsMenu.submenus.filter((m: AppMenu) => m.title !== menu.title)) {
        m.miniOpened = false
      }
      menu.miniOpened = !!state
    }
  }

  private checkHoveredMenu() {
    setTimeout(() => {
      if (!this.menuIconsHovered && !this.menuAppsHovered) {
        this.setActiveMenu()
      }
    }, 50)
  }

  private navigateToUrl(url: string[], menu: AppMenu = null) {
    this.router.navigate(url).then(() => {
      if (menu && menu.miniOpened) {
        menu.miniOpened = false
      }
    })
  }

  private updateUrl(url: string) {
    this.currentUrl = url.substring(1)
    for (const mainMenu of this.appsMenu.submenus) {
      mainMenu.isActive = !!(
        !mainMenu.hide &&
        (mainMenu.link === this.currentUrl || (!!mainMenu.matchLink && mainMenu.matchLink.test(this.currentUrl)))
      )
      if (mainMenu.isActive) {
        this.currentMenu = mainMenu
      }
      if (mainMenu.submenus?.length) {
        for (const menu of mainMenu.submenus) {
          menu.isActive = mainMenu.isActive && (menu.link === this.currentUrl || (!!menu.matchLink && menu.matchLink.test(this.currentUrl)))
          if (menu.submenus?.length) {
            for (const subMenu of menu.submenus) {
              subMenu.isActive = this.currentUrl.startsWith(subMenu.link)
            }
          }
        }
      }
    }
    this.currentMenu ??= this.appsMenu.submenus[0]
    this.updateDynamicTitle()
    this.menuIconsStopPropagation = true
    setTimeout(() => (this.menuIconsStopPropagation = false), 500)
  }

  private setActiveMenu() {
    const menu = this.appsMenu.submenus.find((m: AppMenu) => m.isActive)
    if (menu) {
      this.currentMenu = menu
      this.updateDynamicTitle(this.currentMenu.title)
    }
  }

  private updateDynamicTitle(title?: string) {
    this.dynamicTitle = this.layout.translateString(title !== undefined ? title : this.currentMenu ? this.currentMenu.title : this.appsMenu.title)
  }
}
