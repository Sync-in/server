import { Component, inject, OnDestroy } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { RouterLink } from '@angular/router'
import {
  LucideContrast,
  LucideDynamicIcon,
  LucidePin,
  LucidePinOff,
  LucidePower,
  LucideSettings,
  LucideUserRound,
  LucideVenetianMask
} from '@lucide/angular'
import { APP_URL } from '@sync-in-server/backend/src/common/shared'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { Subscription } from 'rxjs'
import { APP_VERSION } from '../../../../app.constants'
import { AuthService } from '../../../../auth/auth.service'
import { AutoResizeDirective } from '../../../../common/directives/auto-resize.directive'
import { CapitalizePipe } from '../../../../common/pipes/capitalize.pipe'
import { themeLight } from '../../../../layout/layout.interfaces'
import { LayoutService } from '../../../../layout/layout.service'
import { StoreService } from '../../../../store/store.service'
import { logoDarkUrl, logoUrl } from '../../../files/files.constants'
import { UserType } from '../../interfaces/user.interface'
import { USER_ONLINE_STATUS_LIST, USER_PATH } from '../../user.constants'
import { UserService } from '../../user.service'

@Component({
  selector: 'app-user-profile',
  templateUrl: 'user-profile.component.html',
  imports: [FormsModule, RouterLink, CapitalizePipe, LucideDynamicIcon, L10nTranslateDirective, L10nTranslatePipe, AutoResizeDirective]
})
export class UserProfileComponent implements OnDestroy {
  protected readonly logoDarkUrl = logoDarkUrl
  protected readonly logoUrl = logoUrl
  protected readonly store = inject(StoreService)
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly USER_PATH = USER_PATH
  protected readonly allOnlineStatus = USER_ONLINE_STATUS_LIST
  protected readonly appVersion = APP_VERSION
  protected appBaseUrl = `${APP_URL.WEBSITE}`
  protected readonly icons = { LucideUserRound, LucideContrast, LucideSettings, LucidePower, LucideVenetianMask, LucidePin, LucidePinOff }
  protected user: UserType
  protected userAvatar: string = null
  protected readonly themeLight = themeLight
  protected readonly layout = inject(LayoutService)
  private readonly authService = inject(AuthService)
  private readonly userService = inject(UserService)
  private subscriptions: Subscription[] = []

  constructor() {
    this.subscriptions.push(this.store.user.subscribe((user: UserType) => (this.user = user)))
    this.subscriptions.push(this.store.userAvatarUrl.subscribe((avatarUrl: string) => (this.userAvatar = avatarUrl)))
    this.appBaseUrl = this.layout.getCurrentLanguage() === 'fr' ? `${APP_URL.WEBSITE}/fr/` : `${APP_URL.WEBSITE}/`
  }

  ngOnDestroy() {
    this.subscriptions.forEach((s) => s.unsubscribe())
  }

  collapseRSideBar() {
    this.layout.toggleRSideBar(false)
  }

  setOnlineStatus(status: number) {
    this.userService.changeOnlineStatus(status)
  }

  toggleTheme() {
    this.layout.toggleTheme()
  }

  logOut() {
    this.authService.logout()
    this.layout.toggleRSideBar(false)
  }

  openLink(urlType: 'website' | 'news' | 'versions' | 'support') {
    switch (urlType) {
      case 'website':
        this.layout.openUrl(this.appBaseUrl)
        break
      case 'versions':
        this.layout.openUrl(APP_URL.RELEASES)
        break
      default:
        this.layout.openUrl(`${this.appBaseUrl}${urlType}`)
    }
  }
}
