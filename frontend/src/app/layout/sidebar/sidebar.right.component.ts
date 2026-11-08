import { NgComponentOutlet } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { LucideBell, LucideDynamicIcon, LucideFlag, LucidePanelsTopLeft, LucideUserRound, LucideWifi } from '@lucide/angular'
import { USER_ONLINE_STATUS } from '@sync-in-server/backend/src/applications/users/constants/user'
import { L10nTranslateDirective } from 'angular-l10n'
import { FilesTasksComponent } from '../../applications/files/components/sidebar/files-tasks.component'
import { NotificationsComponent } from '../../applications/notifications/components/sidebar/notifications.component'
import { UserOnlinesComponent } from '../../applications/users/components/sidebar/user-onlines.component'
import { UserProfileComponent } from '../../applications/users/components/sidebar/user-profile.component'
import { StoreService } from '../../store/store.service'
import { TAB_GROUP, TAB_MENU, TabMenu } from '../layout.interfaces'
import { LayoutService } from '../layout.service'
import { WindowsComponent } from './components/windows.component'

@Component({
  selector: 'app-sidebar-right',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideDynamicIcon, L10nTranslateDirective, NgComponentOutlet],
  templateUrl: 'sidebar.right.component.html'
})
export class SideBarRightComponent {
  protected readonly visible = signal(false)
  protected readonly showComponents = signal(false)
  protected readonly tabs = signal<TabMenu[]>([])
  protected readonly icons = { LucideWifi }
  private readonly layout = inject(LayoutService)
  private readonly store = inject(StoreService)
  protected readonly theme = this.layout.switchTheme
  protected readonly networkIsOnline = this.layout.networkIsOnline
  private showDelay: any = null
  // tabs
  private currentMenu: TAB_GROUP = null
  private firstsTabs: TabMenu[] = [
    { label: TAB_MENU.PROFILE, components: [UserProfileComponent], icon: null, title: null, active: false },
    {
      label: TAB_MENU.ONLINES,
      components: [UserOnlinesComponent],
      icon: LucideUserRound,
      title: null,
      count: {
        value: computed(() => this.store.onlineUsers().filter((u) => u.onlineStatus !== USER_ONLINE_STATUS.OFFLINE).length),
        level: signal('success')
      },
      showOnCount: true,
      active: false
    },
    {
      label: TAB_MENU.NOTIFICATIONS,
      components: [NotificationsComponent],
      icon: LucideBell,
      title: null,
      count: {
        value: computed(() => this.store.unreadNotifications().length),
        level: signal('warning')
      },
      active: false
    },
    {
      label: TAB_MENU.TASKS,
      components: [FilesTasksComponent],
      icon: LucideFlag,
      title: null,
      count: {
        value: computed(() => this.store.filesActiveTasks().length + this.store.clientSyncTasksCount()),
        level: signal('maroon')
      },
      active: false
    }
  ]
  private lastsTabs: TabMenu[] = [
    {
      label: TAB_MENU.WINDOWS,
      components: [WindowsComponent],
      icon: LucidePanelsTopLeft,
      title: null,
      count: { value: computed(() => this.layout.windows().length), level: signal('maroon') },
      showOnCount: true,
      firstOfLasts: true,
      active: false
    }
  ]

  constructor() {
    this.tabs.set([...this.firstsTabs, ...this.lastsTabs])
    effect(() => this.setVisible(this.layout.rightSideBarIsOpen()))
    this.layout.rightSideBarSetTabs.pipe(takeUntilDestroyed()).subscribe((menuTabs: { name: TAB_GROUP; tabs: TabMenu[] }) => this.setTabs(menuTabs))
    this.layout.rightSideBarOpenAndShowTab.pipe(takeUntilDestroyed()).subscribe((tabName: string) => this.setTabVisible(tabName))
    this.layout.rightSideBarSelectTab.pipe(takeUntilDestroyed()).subscribe((tabName: string) => this.selectTab(tabName))
  }

  setTabVisible(tabName: string) {
    if (!this.visible()) {
      this.selectTab(tabName)
      this.layout.toggleRSideBar(true)
    } else if (tabName && tabName !== this.layout.currentRightSideBarTab()) {
      this.selectTab(tabName)
    } else {
      this.layout.toggleRSideBar(false)
    }
  }

  private setVisible(state: boolean) {
    if (state) {
      clearTimeout(this.showDelay)
      this.showComponents.set(state)
    } else {
      // delay the components hiding
      this.showDelay = setTimeout(() => this.showComponents.set(state), 500)
    }
    this.visible.set(state)
  }

  private setTabs(menuTabs: { name: TAB_GROUP; tabs: TabMenu[] }) {
    if (menuTabs.name !== this.currentMenu) {
      this.tabs.set([...this.firstsTabs, ...(menuTabs.tabs ? menuTabs.tabs : []), ...this.lastsTabs])
      this.currentMenu = menuTabs.name
      if (menuTabs.name === null && !this.tabs().find((tab: TabMenu) => tab.active)) {
        this.layout.toggleRSideBar(false)
      }
    }
  }

  private selectTab(tabName: string) {
    if (tabName) {
      let atLeastOneActive = false
      const tabs = this.tabs()
      for (const tab of tabs) {
        tab.active = tab.label == tabName
        if (tab.active) {
          atLeastOneActive = true
          this.layout.currentRightSideBarTab.set(tabName)
        }
      }
      if (!atLeastOneActive) tabs[0].active = true
      this.tabs.set([...tabs])
    }
  }
}
