/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { API_NOTIFICATIONS, NOTIFICATIONS_ROUTE } from '@sync-in-server/backend/src/applications/notifications/constants/routes'
import type { NotificationFromUser } from '@sync-in-server/backend/src/applications/notifications/interfaces/notification-properties.interface'
import { ActiveToast } from 'ngx-toastr'
import { map, Observable } from 'rxjs'
import { take } from 'rxjs/operators'
import { TAB_MENU } from '../../layout/layout.interfaces'
import { LayoutService } from '../../layout/layout.service'
import { StoreService } from '../../store/store.service'
import { NotificationModel } from './models/notification.model'

@Injectable({
  providedIn: 'root'
})
export class NotificationsService {
  private readonly http = inject(HttpClient)
  private readonly store = inject(StoreService)
  private readonly layout = inject(LayoutService)

  getNotifications(unread: boolean = false): Observable<NotificationModel[]> {
    return this.http
      .get<NotificationFromUser[]>(`${API_NOTIFICATIONS}${unread ? `/${NOTIFICATIONS_ROUTE.UNREAD}` : ''}`)
      .pipe(map((ns) => ns.map((n) => new NotificationModel(n))))
  }

  wasReadNotification(notificationId: number): Observable<void> {
    return this.http.patch<void>(`${API_NOTIFICATIONS}/${notificationId}`, null)
  }

  deleteNotification(notificationId?: number): Observable<void> {
    return this.http.delete<void>(`${API_NOTIFICATIONS}${notificationId ? `/${notificationId}` : ''}`)
  }

  checkUnreadNotifications(checkLast = false): void {
    this.getNotifications().subscribe((notifications: NotificationModel[]) => {
      let layoutNotification: ActiveToast<any> | void
      if (checkLast && notifications.length) {
        const n = notifications[0]
        layoutNotification = this.layout.sendNotification(
          'info',
          n.fromUser.fullName,
          this.layout.translateString(`${this.layout.translateString(n.content.event)}: <b>${n.content.element}</b>`),
          null,
          { enableHtml: true }
        )
      } else {
        const nbUnread = notifications.filter((n: NotificationModel) => !n.wasRead).length
        if (nbUnread) {
          layoutNotification = this.layout.sendNotification(
            'info',
            'Notifications',
            this.layout.translateString(nbUnread === 1 ? 'one_notification' : 'nb_notifications', { nb: nbUnread })
          )
        }
      }
      if (layoutNotification) {
        layoutNotification.onTap.pipe(take(1)).subscribe(() => this.layout.showRSideBarTab(TAB_MENU.NOTIFICATIONS, true))
      }
      this.store.notifications.set(notifications)
    })
  }
}
