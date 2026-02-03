import { Component, computed, inject, Signal } from '@angular/core'
import { USER_ONLINE_STATUS } from '@sync-in-server/backend/src/applications/users/constants/user'
import { L10nTranslateDirective } from 'angular-l10n'
import { AutoResizeDirective } from '../../../../common/directives/auto-resize.directive'
import { StoreService } from '../../../../store/store.service'
import { UserOnlineModel } from '../../models/user-online.model'
import { USER_ONLINE_STATUS_LIST } from '../../user.constants'

@Component({
  selector: 'app-onlines',
  imports: [AutoResizeDirective, L10nTranslateDirective],
  templateUrl: 'user-onlines.component.html'
})
export class UserOnlinesComponent {
  protected readonly allOnlineStatus = USER_ONLINE_STATUS_LIST
  private readonly store = inject(StoreService)
  public onlineUsers: Signal<UserOnlineModel[]> = computed(() =>
    this.store.onlineUsers().filter((u) => u.onlineStatus !== USER_ONLINE_STATUS.OFFLINE)
  )
}
