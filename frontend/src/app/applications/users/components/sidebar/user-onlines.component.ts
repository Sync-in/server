/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Component, computed, Signal, inject } from '@angular/core'
import { USER_ONLINE_STATUS, USER_ONLINE_STATUS_LIST } from '@sync-in-server/backend/src/applications/users/constants/user'
import { L10nTranslateDirective } from 'angular-l10n'
import { AutoResizeDirective } from '../../../../common/directives/auto-resize.directive'
import { StoreService } from '../../../../store/store.service'
import { UserOnlineModel } from '../../models/user-online.model'

@Component({
  selector: 'app-onlines',
  imports: [AutoResizeDirective, L10nTranslateDirective],
  templateUrl: 'user-onlines.component.html'
})
export class UserOnlinesComponent {
  private readonly store = inject(StoreService)
  protected readonly allOnlineStatus = USER_ONLINE_STATUS_LIST
  public onlineUsers: Signal<UserOnlineModel[]> = computed(() =>
    this.store.onlineUsers().filter((u) => u.onlineStatus !== USER_ONLINE_STATUS.OFFLINE)
  )
}
