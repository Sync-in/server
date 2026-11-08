import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { USER_ONLINE_STATUS_LIST } from '../../applications/users/user.constants'
import { StoreService } from '../../store/store.service'
import { BreadcrumbComponent } from '../breadcrumb/breadcrumb.component'
import { TAB_MENU } from '../layout.interfaces'
import { LayoutService } from '../layout.service'
import { NavbarSearchComponent } from '../../applications/search/navbar/navbar-search.component'
import { NavbarSearchService } from './services/navbar-search.service'

@Component({
  selector: 'app-navbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: 'navbar.component.html',
  imports: [BreadcrumbComponent, NavbarSearchComponent]
})
export class NavBarComponent {
  protected readonly allOnlineStatus = USER_ONLINE_STATUS_LIST
  protected readonly navbarSearch = inject(NavbarSearchService)
  private readonly layout = inject(LayoutService)
  private readonly store = inject(StoreService)
  protected readonly leftSideBarIsOpen = this.layout.leftSideBarIsOpen
  protected readonly user = this.store.user
  protected readonly userAvatar = this.store.userAvatarUrl

  openSidebarUser() {
    this.layout.showRSideBarTab(TAB_MENU.PROFILE)
  }

  toggleLeftSideBar() {
    this.layout.toggleLSideBar()
  }
}
