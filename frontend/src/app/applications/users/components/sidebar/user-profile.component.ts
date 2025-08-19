/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Component, OnDestroy, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { RouterLink } from '@angular/router'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faCircleHalfStroke, faCog, faPowerOff, faUserAlt, faUserSecret } from '@fortawesome/free-solid-svg-icons'
import { USER_ONLINE_STATUS_LIST } from '@sync-in-server/backend/src/applications/users/constants/user'
import { L10nTranslateDirective } from 'angular-l10n'
import { Subscription } from 'rxjs'
import { AuthService } from '../../../../auth/auth.service'
import { CapitalizePipe } from '../../../../common/pipes/capitalize.pipe'
import { LayoutService } from '../../../../layout/layout.service'
import { StoreService } from '../../../../store/store.service'
import { UserType } from '../../interfaces/user.interface'
import { USER_PATH } from '../../user.constants'
import { UserService } from '../../user.service'

@Component({
  selector: 'app-user-profile',
  templateUrl: 'user-profile.component.html',
  imports: [FormsModule, RouterLink, CapitalizePipe, FaIconComponent, L10nTranslateDirective]
})
export class UserProfileComponent implements OnDestroy {
  private readonly layout = inject(LayoutService)
  private readonly authService = inject(AuthService)
  private readonly userService = inject(UserService)
  protected readonly store = inject(StoreService)
  protected readonly USER_PATH = USER_PATH
  protected readonly allOnlineStatus = USER_ONLINE_STATUS_LIST
  protected readonly icons = { faUserAlt, faCircleHalfStroke, faCog, faPowerOff, faUserSecret }
  protected user: UserType
  protected userAvatar: string = null
  private subscriptions: Subscription[] = []

  constructor() {
    this.subscriptions.push(this.store.user.subscribe((user: UserType) => (this.user = user)))
    this.subscriptions.push(this.store.userAvatarUrl.subscribe((avatarUrl: string) => (this.userAvatar = avatarUrl)))
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
}
