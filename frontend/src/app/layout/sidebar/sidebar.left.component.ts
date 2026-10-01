import { AsyncPipe, Location, NgTemplateOutlet } from '@angular/common'
import { Component, inject, OnDestroy } from '@angular/core'
import { ResolveEnd, Router, RouterLink } from '@angular/router'
import { LucideChevronLeft, LucideChevronRight, LucideDynamicIcon, LucideLogOut, LucideVenetianMask } from '@lucide/angular'
import {
  USER_SIDEBAR_QUICK_ACCESS_POSITION,
  USER_SIDEBAR_QUICK_ACCESS_VISIBILITY
} from '@sync-in-server/backend/src/applications/users/constants/user-preferences'
import { L10nTranslateDirective } from 'angular-l10n'
import { Subscription } from 'rxjs'
import { filter } from 'rxjs/operators'
import { APP_NAME } from '../../app.constants'
import { ADMIN_MENU } from '../../applications/admin/admin.constants'
import { FAVORITES_PATH } from '../../applications/favorites/favorites.constants'
import { RECENTS_PATH } from '../../applications/recents/recents.constants'
import { SEARCH_MENU } from '../../applications/search/search.constants'
import { SPACES_MENU } from '../../applications/spaces/spaces.constants'
import { SYNC_MENU } from '../../applications/sync/sync.constants'
import { USER_MENU } from '../../applications/users/user.constants'
import { UserService } from '../../applications/users/user.service'
import { AuthService } from '../../auth/auth.service'
import { StoreService } from '../../store/store.service'
import { AppMenu, AppMenuEntry, isAppMenu, isAppMenuSeparator } from '../layout.interfaces'
import { LayoutService } from '../layout.service'
import { NavbarSearchService } from '../navbar/services/navbar-search.service'

@Component({
  selector: 'app-sidebar-left',
  templateUrl: 'sidebar.left.component.html',
  imports: [RouterLink, LucideDynamicIcon, L10nTranslateDirective, AsyncPipe, NgTemplateOutlet]
})
export class SideBarLeftComponent implements OnDestroy {
  protected readonly store = inject(StoreService)
  protected readonly icons = { LucideChevronLeft, LucideChevronRight, LucideLogOut, LucideVenetianMask }
  protected readonly appName = APP_NAME
  protected readonly appMenus = [SPACES_MENU, SEARCH_MENU, SYNC_MENU, USER_MENU, ADMIN_MENU]
  protected dynamicTitle: string
  protected navigationSubmenus: AppMenuEntry[] = (this.appMenus[0].navigationMenu ?? this.appMenus[0]).submenus ?? []
  protected showLogoutShortcut = false
  protected readonly isMenu = isAppMenu
  private currentMenu: AppMenu = this.appMenus[0]
  private visibleShortcutCount = 0
  private readonly location = inject(Location)
  private readonly router = inject(Router)
  private readonly authService = inject(AuthService)
  private readonly layout = inject(LayoutService)
  private readonly navbarSearch = inject(NavbarSearchService)
  private readonly userService = inject(UserService)
  private readonly canPreviewMenuTitle = window.matchMedia('(hover: hover) and (pointer: fine)')
  private subscriptions: Subscription[] = []

  constructor() {
    this.subscriptions.push(this.store.user.pipe(filter((u) => !!u)).subscribe(() => this.loadMenus()))
    this.subscriptions.push(
      this.router.events.pipe(filter((ev) => ev instanceof ResolveEnd)).subscribe((ev: any) => this.updateUrl(ev.urlAfterRedirects))
    )
  }

  ngOnDestroy() {
    this.subscriptions.forEach((s) => s.unsubscribe())
  }

  loadMenus() {
    this.userService.setMenusVisibility(this.appMenus)
    this.updateAppShortcutsVisibility()
    this.updateUrl(this.router.url)
  }

  logOut() {
    this.authService.logout()
  }

  logOutImpersonate() {
    this.authService.logout(true)
  }

  toggleSideBar() {
    this.layout.toggleLSideBar()
  }

  navigateInHistory(action: 'back' | 'next') {
    if (action === 'back') {
      this.location.back()
    } else {
      this.location.forward()
    }
  }

  navigateToMenu(menu: AppMenu) {
    if (menu === SEARCH_MENU) {
      this.closeSideBarOnMobile()
      this.navbarSearch
        .openLastSearch()
        .then(() => this.navbarSearch.requestFocus())
        .catch(console.error)
      return
    }
    this.router.navigate([menu.link]).catch(console.error)
  }

  closeSideBarOnMobile() {
    if (this.layout.isSmallerMediumScreen()) {
      this.layout.toggleLeftSideBar.next(2)
    }
  }

  previewMenuTitle(title: string) {
    if (!this.canPreviewMenuTitle.matches) {
      return
    }
    this.updateDynamicTitle(title)
  }

  restoreMenuTitle() {
    if (!this.canPreviewMenuTitle.matches) {
      return
    }
    this.updateDynamicTitle()
  }

  protected showAppShortcut(menu: AppMenu): boolean {
    if (menu.hide) return false
    return menu !== SEARCH_MENU || this.visibleShortcutCount <= 4
  }

  protected showMenuSeparator(menus: AppMenuEntry[] | undefined, separatorIndex: number, separator: AppMenuEntry): boolean {
    if (!menus?.length || !isAppMenuSeparator(separator)) {
      return false
    }
    if (separator.title) {
      return this.hasVisibleMenuUntilNextSeparator(menus, separatorIndex + 1, 1)
    }
    const hasMenuBefore = this.hasVisibleMenuUntilNextSimpleSeparator(menus, separatorIndex - 1, -1)
    const hasMenuAfter = this.hasVisibleMenuUntilNextSimpleSeparator(menus, separatorIndex + 1, 1)
    return hasMenuBefore && hasMenuAfter
  }

  protected showNavigationMenu(menu: AppMenu): boolean {
    if (menu.hide) return false
    if (!this.isQuickAccessMenu(menu)) return true
    const quickAccess = this.store.user.getValue()?.preferences?.sidebarQuickAccessVisibility ?? USER_SIDEBAR_QUICK_ACCESS_VISIBILITY.BOTH
    if (menu.link === RECENTS_PATH.BASE) {
      return quickAccess === USER_SIDEBAR_QUICK_ACCESS_VISIBILITY.BOTH || quickAccess === USER_SIDEBAR_QUICK_ACCESS_VISIBILITY.RECENTS
    }
    return quickAccess === USER_SIDEBAR_QUICK_ACCESS_VISIBILITY.BOTH || quickAccess === USER_SIDEBAR_QUICK_ACCESS_VISIBILITY.FAVORITES
  }

  protected isBottomMenu(menu: AppMenuEntry): boolean {
    if (isAppMenu(menu) && this.isQuickAccessMenu(menu)) {
      const position = this.store.user.getValue()?.preferences?.sidebarQuickAccessPosition ?? USER_SIDEBAR_QUICK_ACCESS_POSITION.TOP
      return position === USER_SIDEBAR_QUICK_ACCESS_POSITION.BOTTOM
    }
    return menu.placement === 'bottom'
  }

  private hasVisibleMenuUntilNextSeparator(menus: AppMenuEntry[], startIndex: number, direction: 1 | -1): boolean {
    for (let i = startIndex; i >= 0 && i < menus.length; i += direction) {
      const menu = menus[i]
      if (isAppMenuSeparator(menu)) {
        return false
      }
      if (isAppMenu(menu) && this.showNavigationMenu(menu)) {
        return true
      }
    }
    return false
  }

  private isQuickAccessMenu(menu: AppMenu): boolean {
    return menu.link === RECENTS_PATH.BASE || menu.link === FAVORITES_PATH.BASE
  }

  private hasVisibleMenuUntilNextSimpleSeparator(menus: AppMenuEntry[], startIndex: number, direction: 1 | -1): boolean {
    for (let i = startIndex; i >= 0 && i < menus.length; i += direction) {
      const menu = menus[i]
      if (isAppMenu(menu) && this.showNavigationMenu(menu)) {
        return true
      }
      if (isAppMenuSeparator(menu) && !menu.title) {
        return false
      }
    }
    return false
  }

  private updateUrl(url: string) {
    const currentUrl = url.substring(1)
    this.currentMenu = this.appMenus.find((menu) => !menu.hide) ?? this.appMenus[0]
    for (const mainMenu of this.appMenus) {
      mainMenu.isActive = !!(!mainMenu.hide && (mainMenu.link === currentUrl || (!!mainMenu.matchLink && mainMenu.matchLink.test(currentUrl))))
      if (mainMenu.isActive) {
        this.currentMenu = mainMenu
      }
      if (mainMenu.submenus?.length) {
        for (const menu of mainMenu.submenus) {
          if (isAppMenuSeparator(menu)) {
            continue
          }
          menu.isActive = mainMenu.isActive && (menu.link === currentUrl || (!!menu.matchLink && menu.matchLink.test(currentUrl)))
          if (menu.submenus?.length) {
            for (const subMenu of menu.submenus) {
              if (isAppMenuSeparator(subMenu)) {
                continue
              }
              subMenu.isActive = currentUrl.startsWith(subMenu.link)
            }
          }
        }
      }
    }
    this.navigationSubmenus = (this.currentMenu.navigationMenu ?? this.currentMenu).submenus ?? []
    this.updateDynamicTitle()
  }

  private updateAppShortcutsVisibility() {
    const isImpersonated = this.store.userImpersonate()
    this.visibleShortcutCount = this.appMenus.filter((menu) => !menu.hide).length + (isImpersonated ? 1 : 0)
    this.showLogoutShortcut = !this.store.isElectronApp() && !isImpersonated && this.appMenus.filter((menu) => this.showAppShortcut(menu)).length <= 3
  }

  private updateDynamicTitle(title?: string) {
    this.dynamicTitle = title ?? this.currentMenu.title
  }
}
