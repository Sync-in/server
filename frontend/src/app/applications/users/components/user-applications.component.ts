/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Component, inject } from '@angular/core'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faApple, faLinux, faWindows } from '@fortawesome/free-brands-svg-icons'
import { faDownload, faTerminal } from '@fortawesome/free-solid-svg-icons'
import { APP_STORE_PLATFORM } from '@sync-in-server/backend/src/applications/sync/constants/store'
import { L10nTranslateDirective } from 'angular-l10n'
import { AutoResizeDirective } from '../../../common/directives/auto-resize.directive'
import { TimeDateFormatPipe } from '../../../common/pipes/time-date-format.pipe'
import { downloadWithAnchor } from '../../../common/utils/functions'
import { LayoutService } from '../../../layout/layout.service'
import { StoreService } from '../../../store/store.service'
import { USER_ICON, USER_PATH, USER_TITLE } from '../user.constants'
import { UserService } from '../user.service'

@Component({
  selector: 'app-user-applications',
  imports: [FaIconComponent, L10nTranslateDirective, AutoResizeDirective, TimeDateFormatPipe],
  templateUrl: './user-applications.component.html'
})
export class UserApplicationsComponent {
  protected readonly store = inject(StoreService)
  private readonly layout = inject(LayoutService)
  private readonly userService = inject(UserService)
  protected readonly icons = { faWindows, faApple, faLinux, faDownload, faTerminal }
  protected readonly APP_STORE_OS = APP_STORE_PLATFORM
  protected readonly APP_STORE_PLATFORM_LIST = Object.values(APP_STORE_PLATFORM)

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
