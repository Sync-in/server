import { AsyncPipe, NgComponentOutlet } from '@angular/common'
import { Component, computed, inject, OnDestroy } from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faBell, faFlag, faUser, faWindowRestore } from '@fortawesome/free-regular-svg-icons'
import { faWifi } from '@fortawesome/free-solid-svg-icons'
import { FileTask } from '@sync-in-server/backend/src/applications/files/models/file-task'
import { USER_ONLINE_STATUS } from '@sync-in-server/backend/src/applications/users/constants/user'
import { L10nTranslateDirective } from 'angular-l10n'
import { combineLatest, Subscription } from 'rxjs'
import { map } from 'rxjs/operators'
import { FilesTasksComponent } from '../../applications/files/components/sidebar/files-tasks.component'
import { NotificationsComponent } from '../../applications/notifications/components/sidebar/notifications.component'
import { UserOnlinesComponent } from '../../applications/users/components/sidebar/user-onlines.component'
import { UserProfileComponent } from '../../applications/users/components/sidebar/user-profile.component'
import { StoreService } from '../../store/store.service'
import { AppWindow, TAB_GROUP, TAB_MENU, TabMenu, themeLight } from '../layout.interfaces'
import { LayoutService } from '../layout.service'
import { WindowsComponent } from './components/windows.component'

@Component({
  selector: 'app-sidebar-right',
  imports: [FaIconComponent, L10nTranslateDirective, NgComponentOutlet, AsyncPipe],
  templateUrl: 'sidebar.right.component.html'
})
export class SideBarRightComponent implements OnDestroy {
  protected visible = false
  protected showComponents = false
  protected tabs: TabMenu[] = []
  protected theme = themeLight
  protected networkIsOnline = true
  protected readonly icons = { faWifi }
  private readonly layout = inject(LayoutService)
  private readonly store = inject(StoreService)
  private subscriptions: Subscription[] = []
  private showDelay: any = null
  // tabs
  private currentMenu: TAB_GROUP = null
  private firstsTabs: TabMenu[] = [
    { label: TAB_MENU.PROFILE, components: [UserProfileComponent], icon: null, title: null, active: false },
    {
      label: TAB_MENU.ONLINES,
      components: [UserOnlinesComponent],
      icon: faUser,
      title: null,
      count: {
        value: toObservable(computed(() => this.store.onlineUsers().filter((u) => u.onlineStatus !== USER_ONLINE_STATUS.OFFLINE).length)),
        level: 'success'
      },
      showOnCount: true,
      active: false
    },
    {
      label: TAB_MENU.NOTIFICATIONS,
      components: [NotificationsComponent],
      icon: faBell,
      title: null,
      count: {
        value: toObservable(computed(() => this.store.unreadNotifications().length)),
        level: 'warning'
      },
      active: false
    },
    {
      label: TAB_MENU.TASKS,
      components: [FilesTasksComponent],
      icon: faFlag,
      title: null,
      count: {
        value: combineLatest([this.store.filesActiveTasks.pipe(map((tasks: FileTask[]) => tasks.length)), this.store.clientSyncTasksCount]).pipe(
          map(([fCount, sCount]) => fCount + sCount)
        ),
        level: 'maroon'
      },
      active: false
    }
  ]
  private lastsTabs: TabMenu[] = [
    {
      label: TAB_MENU.WINDOWS,
      components: [WindowsComponent],
      icon: faWindowRestore,
      title: null,
      count: { value: this.layout.windows.pipe(map((modals: AppWindow[]) => modals.length)), level: 'maroon' },
      showOnCount: true,
      firstOfLasts: true,
      active: false
    }
  ]

  constructor() {
    this.tabs = [...this.firstsTabs, ...this.lastsTabs]
    this.subscriptions.push(this.layout.rightSideBarIsOpen.subscribe((state: boolean) => this.setVisible(state)))
    this.subscriptions.push(this.layout.rightSideBarSetTabs.subscribe((menuTabs: { name: TAB_GROUP; tabs: TabMenu[] }) => this.setTabs(menuTabs)))
    this.subscriptions.push(this.layout.rightSideBarOpenAndShowTab.subscribe((tabName: string) => this.setTabVisible(tabName)))
    this.subscriptions.push(this.layout.rightSideBarSelectTab.subscribe((tabName: string) => this.selectTab(tabName)))
    this.subscriptions.push(this.layout.switchTheme.subscribe((theme: string) => (this.theme = theme)))
    this.subscriptions.push(this.layout.networkIsOnline.subscribe((state: boolean) => (this.networkIsOnline = state)))
  }

  ngOnDestroy() {
    this.subscriptions.forEach((s) => s.unsubscribe())
  }

  setTabVisible(tabName: string) {
    if (!this.visible) {
      this.selectTab(tabName)
      this.layout.toggleRSideBar(true)
    } else if (tabName && tabName !== this.layout.currentRightSideBarTab) {
      this.selectTab(tabName)
    } else {
      this.layout.toggleRSideBar(false)
    }
  }

  private setVisible(state: boolean) {
    if (state) {
      clearTimeout(this.showDelay)
      this.showComponents = state
    } else {
      // delay the components hiding
      this.showDelay = setTimeout(() => (this.showComponents = state), 500)
    }
    this.visible = state
  }

  private setTabs(menuTabs: { name: TAB_GROUP; tabs: TabMenu[] }) {
    if (menuTabs.name !== this.currentMenu) {
      this.tabs = [...this.firstsTabs, ...(menuTabs.tabs ? menuTabs.tabs : []), ...this.lastsTabs]
      this.currentMenu = menuTabs.name
      if (menuTabs.name === null && !this.tabs.find((tab: TabMenu) => tab.active)) {
        this.layout.toggleRSideBar(false)
      }
    }
  }

  private selectTab(tabName: string) {
    if (tabName) {
      let atLeastOneActive = false
      for (const tab of this.tabs) {
        tab.active = tab.label == tabName
        if (tab.active) {
          atLeastOneActive = true
          this.layout.currentRightSideBarTab = tabName
        }
      }
      if (!atLeastOneActive) {
        this.tabs[0].active = true
      }
    }
  }
}
