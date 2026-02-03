import { HttpService } from '@nestjs/axios'
import { Injectable, Logger } from '@nestjs/common'
import type { AxiosResponse } from 'axios'
import { VERSION } from '../../../app.constants'
import { APP_URL } from '../../../common/shared'
import { Cache } from '../../../infrastructure/cache/services/cache.service'
import { HTTP_METHOD } from '../../applications.constants'
import { NOTIFICATION_APP, NOTIFICATION_APP_EVENT } from '../../notifications/constants/notifications'
import { NotificationContent } from '../../notifications/interfaces/notification-properties.interface'
import type { UserMailNotification } from '../../notifications/interfaces/user-mail-notification.interface'
import { NotificationsManager } from '../../notifications/services/notifications-manager.service'
import { AdminUsersQueries } from '../../users/services/admin-users-queries.service'
import type { ServerReleaseNotification, ServerReleaseVersionManifest } from '../interfaces/check-update.interfaces'
import { isServerUpdateAvailable } from '../utils/check-update'

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name)

  constructor(
    private readonly http: HttpService,
    private readonly cache: Cache,
    private readonly notificationsManager: NotificationsManager,
    private readonly adminUsersQueries: AdminUsersQueries
  ) {}

  async checkServerUpdateAndNotify() {
    let lastVersion: string
    try {
      const res: AxiosResponse<ServerReleaseVersionManifest> = await this.http.axiosRef({
        method: HTTP_METHOD.GET,
        url: APP_URL.SERVER_VERSION_MANIFEST
      })
      lastVersion = res.data?.tag_name || ''
    } catch (e) {
      this.logger.warn(`${this.checkServerUpdateAndNotify.name} - unable to check update: ${e}`)
      return
    }
    if (!lastVersion.startsWith('v')) {
      this.logger.warn(`${this.checkServerUpdateAndNotify.name} - unable to check version: ${lastVersion}`)
      return
    }
    lastVersion = lastVersion.slice(1) // remove 'v' to compare with the current version
    if (!isServerUpdateAvailable(VERSION, lastVersion)) {
      return
    }
    // Get the last version that was notified to administrators
    const notifiedVersion: ServerReleaseNotification = await this.cache.get(this.checkServerUpdateAndNotify.name)
    if (!notifiedVersion?.version) {
      // The version was never stored, do it
      await this.cache.set(this.checkServerUpdateAndNotify.name, { version: VERSION } satisfies ServerReleaseNotification, 0)
      return
    }
    if (notifiedVersion.version === lastVersion) {
      // Notification was already sent to administrators
      return
    }
    const adminsToNotify: UserMailNotification[] = await this.adminUsersQueries.listAdminsToNotify()
    if (!adminsToNotify.length) {
      return
    }
    const notification: NotificationContent = {
      app: NOTIFICATION_APP.UPDATE_AVAILABLE,
      event: NOTIFICATION_APP_EVENT.UPDATE_AVAILABLE,
      element: lastVersion,
      externalUrl: APP_URL.RELEASES,
      url: null
    }
    this.notificationsManager
      .create(adminsToNotify, notification)
      .then(() => this.cache.set(this.checkServerUpdateAndNotify.name, { version: lastVersion } satisfies ServerReleaseNotification, 0))
      .catch((e: Error) => this.logger.error(`${this.checkServerUpdateAndNotify.name} - ${e}`))
  }
}
