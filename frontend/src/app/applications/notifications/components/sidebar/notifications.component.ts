/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpErrorResponse } from '@angular/common/http'
import { AfterViewInit, Component, effect, ElementRef, inject, QueryList, ViewChildren } from '@angular/core'
import { Router } from '@angular/router'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faCheck, faCircleInfo, faMagnifyingGlass, faTimes, faTrashAlt } from '@fortawesome/free-solid-svg-icons'
import { NOTIFICATION_APP } from '@sync-in-server/backend/src/applications/notifications/constants/notifications'
import { L10nTranslateDirective } from 'angular-l10n'
import { AutoResizeDirective } from '../../../../common/directives/auto-resize.directive'
import { TimeAgoPipe } from '../../../../common/pipes/time-ago.pipe'
import { LayoutService } from '../../../../layout/layout.service'
import { StoreService } from '../../../../store/store.service'
import { SPACES_PATH } from '../../../spaces/spaces.constants'
import { UserAvatarComponent } from '../../../users/components/utils/user-avatar.component'
import { NotificationModel } from '../../models/notification.model'
import { NotificationsService } from '../../notifications.service'

@Component({
  selector: 'app-notifications',
  imports: [L10nTranslateDirective, AutoResizeDirective, FaIconComponent, TimeAgoPipe, UserAvatarComponent],
  templateUrl: 'notifications.component.html'
})
export class NotificationsComponent implements AfterViewInit {
  @ViewChildren('notificationsHtml') notificationsHtml!: QueryList<ElementRef>
  protected readonly store = inject(StoreService)
  protected readonly icons = { faCheck, faTimes, faMagnifyingGlass, faTrashAlt, faCircleInfo }
  private readonly router = inject(Router)
  private readonly layout = inject(LayoutService)
  private readonly notificationsService = inject(NotificationsService)
  private observer!: IntersectionObserver

  constructor() {
    // Re-observe the elements if notifications array has changes
    effect(() => {
      this.store.unreadNotifications()
      setTimeout(() => this.observeUnreadNotifications(), 0)
    })
  }

  ngAfterViewInit(): void {
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const element = entry.target as HTMLElement
            const notificationIndex = this.notificationsHtml.toArray().findIndex((el) => el.nativeElement === element)
            if (notificationIndex !== -1) {
              const notification = this.store.notifications()[notificationIndex]
              if (notification && !notification.wasRead) {
                notification.wasRead = true
                notification.soonRead = true
                this.observer.unobserve(element)
                setTimeout(() => this.wasRead(notification), 2000)
              }
            }
          }
        })
      },
      {
        threshold: 0.5
      }
    )
  }

  removeAll() {
    this.notificationsService.deleteNotification().subscribe({
      next: () => this.store.notifications.set([]),
      error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Notifications', 'Unable to delete', e)
    })
  }

  remove(notification: NotificationModel) {
    this.notificationsService.deleteNotification(notification.id).subscribe({
      next: () =>
        this.store.notifications.update((notifications: NotificationModel[]) => {
          return notifications.filter((n) => notification.id !== n.id)
        }),
      error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Notifications', 'Unable to delete', e)
    })
  }

  goto(n: NotificationModel) {
    const element = n.content.app === NOTIFICATION_APP.SYNC ? n.content.element.split('/').at(-1) : n.content.element
    this.router.navigate([SPACES_PATH.SPACES, ...n.content.url.split('/')], { queryParams: { select: element } }).catch(console.error)
  }

  private observeUnreadNotifications() {
    // Only watch the unread notifications
    if (!this.notificationsHtml) return
    this.notificationsHtml.forEach((notificationElement, index) => {
      const notification: NotificationModel = this.store.notifications()[index]
      if (notification && !notification.wasRead) {
        this.observer.observe(notificationElement.nativeElement)
      }
    })
  }

  private wasRead(notification: NotificationModel) {
    this.notificationsService.wasReadNotification(notification.id).subscribe({
      next: () => {
        this.store.notifications.update((notifications: NotificationModel[]) => {
          const updatedNotifications = [...notifications]
          const n = updatedNotifications.find((n) => n.id === notification.id)
          if (n) {
            n.soonRead = false
            n.wasRead = true
          }
          return updatedNotifications
        })
      },
      error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Notifications', 'Unable to mark as read', e)
    })
  }
}
