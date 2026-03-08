import { AsyncPipe, NgTemplateOutlet } from '@angular/common'
import { Component, inject, OnDestroy } from '@angular/core'
import { ResolveEnd, Router, RouterLink } from '@angular/router'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faChevronDown, faUserSecret } from '@fortawesome/free-solid-svg-icons'
import { L10nTranslateDirective } from 'angular-l10n'
import { Subscription } from 'rxjs'
import { filter } from 'rxjs/operators'
import { APP_MENU, APP_VERSION } from '../../app.constants'
import { ADMIN_MENU } from '../../applications/admin/admin.constants'
import { logoIconUrl } from '../../applications/files/files.constants'
import { SEARCH_MENU } from '../../applications/search/search.constants'
import { SPACES_MENU } from '../../applications/spaces/spaces.constants'
import { SYNC_MENU } from '../../applications/sync/sync.constants'
import { USER_MENU } from '../../applications/users/user.constants'
import { UserService } from '../../applications/users/user.service'
import { AuthService } from '../../auth/auth.service'
import { StoreService } from '../../store/store.service'
import { AppMenu } from '../layout.interfaces'
import { LayoutService } from '../layout.service'

@Component({
  selector: 'app-sidebar-left',
  templateUrl: 'sidebar.left.component.html',
  imports: [RouterLink, FaIconComponent, L10nTranslateDirective, AsyncPipe, NgTemplateOutlet]
})
export class SideBarLeftComponent implements OnDestroy {
  protected readonly store = inject(StoreService)
  protected readonly icons = { faUserSecret, faChevronDown }
  protected logoIconUrl = logoIconUrl
  protected appVersion: string
  protected dynamicTitle: string
  protected currentUrl: string
  protected currentMenu: AppMenu
  protected appsMenu: AppMenu = APP_MENU
  private readonly router = inject(Router)
  private readonly authService = inject(AuthService)
  private readonly layout = inject(LayoutService)
  private readonly userService = inject(UserService)
  private subscriptions: Subscription[] = []

  constructor() {
    this.appVersion = APP_VERSION
    this.appsMenu.submenus = [SPACES_MENU, SEARCH_MENU, SYNC_MENU, USER_MENU, ADMIN_MENU]
    this.subscriptions.push(this.store.user.pipe(filter((u) => !!u)).subscribe(() => this.loadMenus()))
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

  toggleSideBar() {
    this.layout.toggleLSideBar()
  }

  navigateToMenu(menu: AppMenu) {
    this.navigateToUrl([menu.link])
  }

  previewMenuTitle(title: string) {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      return
    }
    this.updateDynamicTitle(title)
  }

  restoreMenuTitle() {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      return
    }
    this.updateDynamicTitle()
  }

  private navigateToUrl(url: string[]) {
    this.router.navigate(url).catch(console.error)
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
  }

  private updateDynamicTitle(title?: string) {
    this.dynamicTitle = this.layout.translateString(title !== undefined ? title : this.currentMenu ? this.currentMenu.title : this.appsMenu.title)
  }
}
