import { Component, inject } from '@angular/core'
import { LucideDynamicIcon, LucideHardDriveDownload, LucideTerminal } from '@lucide/angular'
import { APP_STORE_PLATFORM } from '@sync-in-server/backend/src/applications/sync/constants/store'
import { L10nTranslateDirective } from 'angular-l10n'
import { PlatformIconComponent } from '../../../common/components/platform-icon.component'
import { AutoResizeDirective } from '../../../common/directives/auto-resize.directive'
import { TimeDateFormatPipe } from '../../../common/pipes/time-date-format.pipe'
import { downloadWithAnchor } from '../../../common/utils/functions'
import { LayoutService } from '../../../layout/layout.service'
import { StoreService } from '../../../store/store.service'
import { USER_ICON, USER_PATH, USER_TITLE } from '../user.constants'
import { UserService } from '../user.service'

@Component({
  selector: 'app-user-applications',
  imports: [LucideDynamicIcon, PlatformIconComponent, L10nTranslateDirective, AutoResizeDirective, TimeDateFormatPipe],
  templateUrl: './user-applications.component.html',
  styleUrl: './user-applications.component.scss'
})
export class UserApplicationsComponent {
  protected readonly store = inject(StoreService)
  protected readonly icons = { LucideHardDriveDownload, LucideTerminal }
  protected readonly APP_STORE_OS = APP_STORE_PLATFORM
  protected readonly APP_STORE_PLATFORM_LIST: APP_STORE_PLATFORM[] = Object.values(APP_STORE_PLATFORM) as APP_STORE_PLATFORM[]
  private readonly layout = inject(LayoutService)
  private readonly userService = inject(UserService)

  constructor() {
    this.userService.checkAppStoreAvailability()
    this.layout.setBreadcrumbIcon(USER_ICON.APPS)
    this.layout.setBreadcrumbNav({
      url: `/${USER_PATH.BASE}/${USER_PATH.APPS}/${USER_TITLE.APPS}`,
      splicing: 2,
      translating: true,
      sameLink: true
    })
  }

  download(platform: APP_STORE_PLATFORM, arm64OrTarGz = false) {
    const app = this.store.appStoreManifest().platform[platform].find((p) => {
      if (platform === APP_STORE_PLATFORM.NODE) {
        return (p.ext === 'tar.gz') === arm64OrTarGz
      } else {
        return (p.arch === 'arm64') === arm64OrTarGz
      }
    })
    downloadWithAnchor(app.url)
  }
}
