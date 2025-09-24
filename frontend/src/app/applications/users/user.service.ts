/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { NOTIFICATIONS_WS } from '@sync-in-server/backend/src/applications/notifications/constants/websocket'
import { SPACE_OPERATION } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import { SYNC_ROUTE } from '@sync-in-server/backend/src/applications/sync/constants/routes'
import { AppStoreManifest } from '@sync-in-server/backend/src/applications/sync/interfaces/store-manifest.interface'
import {
  API_USERS_MY_APP_PASSWORDS,
  API_USERS_MY_AVATAR,
  API_USERS_MY_GROUPS,
  API_USERS_MY_GROUPS_BROWSE,
  API_USERS_MY_GROUPS_LEAVE,
  API_USERS_MY_GUESTS,
  API_USERS_MY_LANGUAGE,
  API_USERS_MY_NOTIFICATION,
  API_USERS_MY_PASSWORD,
  USERS_ROUTE
} from '@sync-in-server/backend/src/applications/users/constants/routes'
import { USER_ONLINE_STATUS, USER_PERMISSION } from '@sync-in-server/backend/src/applications/users/constants/user'
import { USERS_WS } from '@sync-in-server/backend/src/applications/users/constants/websocket'
import type { UserCreateOrUpdateGroupDto } from '@sync-in-server/backend/src/applications/users/dto/create-or-update-group.dto'
import type {
  CreateUserDto,
  UpdateUserDto,
  UpdateUserFromGroupDto
} from '@sync-in-server/backend/src/applications/users/dto/create-or-update-user.dto'
import type { SearchMembersDto } from '@sync-in-server/backend/src/applications/users/dto/search-members.dto'
import type {
  UserAppPasswordDto,
  UserLanguageDto,
  UserNotificationDto,
  UserUpdatePasswordDto
} from '@sync-in-server/backend/src/applications/users/dto/user-properties.dto'
import type { GroupBrowse } from '@sync-in-server/backend/src/applications/users/interfaces/group-browse.interface'
import type { GroupMember } from '@sync-in-server/backend/src/applications/users/interfaces/group-member'
import type { GuestUser } from '@sync-in-server/backend/src/applications/users/interfaces/guest-user.interface'
import type { Member } from '@sync-in-server/backend/src/applications/users/interfaces/member.interface'
import type { UserAppPassword } from '@sync-in-server/backend/src/applications/users/interfaces/user-secrets.interface'
import type {
  EventChangeOnlineStatus,
  EventUpdateOnlineStatus,
  UserOnline
} from '@sync-in-server/backend/src/applications/users/interfaces/websocket.interface'
import { API_TWO_FA_ADMIN_RESET_USER, API_TWO_FA_DISABLE, API_TWO_FA_ENABLE } from '@sync-in-server/backend/src/authentication/constants/routes'
import type { TwoFaVerifyWithPasswordDto } from '@sync-in-server/backend/src/authentication/dto/two-fa-verify.dto'
import type { TwoFaEnableResult, TwoFaSetup, TwoFaVerifyResult } from '@sync-in-server/backend/src/authentication/interfaces/two-fa-setup.interface'
import { BsModalRef } from 'ngx-bootstrap/modal'
import { Socket } from 'ngx-socket-io'
import { catchError, map, Observable } from 'rxjs'
import { AppMenu } from '../../layout/layout.interfaces'
import { LayoutService } from '../../layout/layout.service'
import { StoreService } from '../../store/store.service'
import { NotificationsService } from '../notifications/notifications.service'
import { SPACES_TITLE } from '../spaces/spaces.constants'
import { UserAuth2FaVerifyDialogComponent } from './components/dialogs/user-auth-2fa-verify-dialog.component'
import { UserType } from './interfaces/user.interface'
import { GroupBrowseModel } from './models/group-browse.model'
import { GuestUserModel } from './models/guest.model'
import { MemberModel } from './models/member.model'
import { UserOnlineModel } from './models/user-online.model'
import { myAvatarUrl } from './user.functions'

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient)
  private readonly layout = inject(LayoutService)
  private readonly store = inject(StoreService)
  private readonly webSocket = inject(Socket)
  private readonly notifications = inject(NotificationsService)

  constructor() {
    this.webSocket.fromEvent('connect').subscribe(() => this.notifications.checkUnreadNotifications())
    this.webSocket.fromEvent('disconnect').subscribe(() => this.store.onlineUsers.set([]))
    this.webSocket.fromEvent(NOTIFICATIONS_WS.EVENTS.NOTIFICATION).subscribe(() => this.notifications.checkUnreadNotifications(true))
    this.webSocket
      .fromEvent(USERS_WS.EVENTS.ONLINE_USER)
      .pipe(map((u: UserOnline) => new UserOnlineModel(u)))
      .subscribe((user) => this.newOnlineUser(user))
    this.webSocket
      .fromEvent(USERS_WS.EVENTS.ONLINE_USERS)
      .pipe(map((users: UserOnline[]) => users.map((u) => new UserOnlineModel(u))))
      .subscribe((users) => this.setOnlineUsers(users))
    this.webSocket.fromEvent(USERS_WS.EVENTS.ONLINE_STATUS).subscribe((event: EventUpdateOnlineStatus) => this.receiveOnlineStatus(event))
  }

  get user() {
    return this.store.user.getValue()
  }

  initUser(user: UserType, impersonate = false) {
    this.refreshAvatar()
    this.layout.setLanguage(user.language)
    this.store.userImpersonate.set(impersonate || user.impersonated)
    this.store.user.next(user)
    this.checkQuota(this.store.user.getValue())
    if (impersonate) {
      this.disconnectWebSocket()
    }
    this.connectWebSocket()
  }

  connectWebSocket() {
    this.webSocket.ioSocket.io.opts.query = { onlineStatus: this.user.onlineStatus }
    this.webSocket.connect()
  }

  disconnectWebSocket() {
    this.webSocket.disconnect()
  }

  setOnlineUsers(users: UserOnlineModel[]) {
    this.store.onlineUsers.set(users)
  }

  newOnlineUser(user: UserOnlineModel) {
    if (this.store.onlineUsers().find((u) => u.id === user.id)) {
      this.receiveOnlineStatus({ userId: user.id, status: user.onlineStatus })
    } else {
      this.store.onlineUsers.update((users: UserOnlineModel[]) => [user, ...users])
    }
  }

  userHavePermission(application: USER_PERMISSION): boolean {
    if (this.user.isAdmin) {
      return true
    }
    if (this.user) {
      return this.user.applications.indexOf(application) !== -1
    }
    return false
  }

  browseGroup(name?: string): Observable<GroupBrowseModel> {
    return this.http.get<GroupBrowse>(`${API_USERS_MY_GROUPS_BROWSE}${name ? `/${name}` : ''}`).pipe(map((browse) => new GroupBrowseModel(browse)))
  }

  createPersonalGroup(userCreateOrUpdateGroupDto: UserCreateOrUpdateGroupDto): Observable<MemberModel> {
    return this.http.post<GroupMember>(API_USERS_MY_GROUPS, userCreateOrUpdateGroupDto).pipe(map((g) => new MemberModel(g)))
  }

  updatePersonalGroup(groupId: number, userCreateOrUpdateGroupDto: UserCreateOrUpdateGroupDto): Observable<MemberModel> {
    return this.http.put<GroupMember>(`${API_USERS_MY_GROUPS}/${groupId}`, userCreateOrUpdateGroupDto).pipe(map((g) => new MemberModel(g)))
  }

  leavePersonalGroup(groupId: number): Observable<void> {
    return this.http.delete<void>(`${API_USERS_MY_GROUPS_LEAVE}/${groupId}`)
  }

  addUsersToGroup(groupId: number, userIds: number[]): Observable<void> {
    return this.http.patch<void>(`${API_USERS_MY_GROUPS}/${groupId}/${USERS_ROUTE.USERS}`, userIds)
  }

  deletePersonalGroup(groupId: number): Observable<void> {
    return this.http.delete<void>(`${API_USERS_MY_GROUPS}/${groupId}`)
  }

  updateUserFromPersonalGroup(groupId: number, userId: number, updateUserFromGroupDto: UpdateUserFromGroupDto): Observable<void> {
    return this.http.patch<void>(`${API_USERS_MY_GROUPS}/${groupId}/${USERS_ROUTE.USERS}/${userId}`, updateUserFromGroupDto)
  }

  removeUserFromGroup(groupId: number, userId: number): Observable<void> {
    return this.http.delete<void>(`${API_USERS_MY_GROUPS}/${groupId}/${USERS_ROUTE.USERS}/${userId}`)
  }

  listGuests(): Observable<GuestUserModel[]> {
    return this.http.get<GuestUser[]>(API_USERS_MY_GUESTS).pipe(map((guests) => guests.map((g) => new GuestUserModel(g))))
  }

  getGuest(guestId: number): Observable<GuestUserModel> {
    return this.http.get<GuestUser>(`${API_USERS_MY_GUESTS}/${guestId}`).pipe(map((g) => new GuestUserModel(g)))
  }

  createGuest(createUserDto: CreateUserDto): Observable<GuestUserModel> {
    return this.http.post<GuestUser>(API_USERS_MY_GUESTS, createUserDto).pipe(map((g) => new GuestUserModel(g)))
  }

  updateGuest(guestId: number, updateUserDto: UpdateUserDto): Observable<GuestUserModel | null> {
    return this.http.put<GuestUser>(`${API_USERS_MY_GUESTS}/${guestId}`, updateUserDto).pipe(map((g) => (g ? new GuestUserModel(g) : null)))
  }

  deleteGuest(guestId: number): Observable<void> {
    return this.http.delete<void>(`${API_USERS_MY_GUESTS}/${guestId}`)
  }

  genAvatar() {
    this.http.patch(API_USERS_MY_AVATAR, null).subscribe({
      next: () => this.refreshAvatar(),
      error: (e) => this.layout.sendNotification('error', 'Configuration', 'Avatar', e)
    })
  }

  uploadAvatar(file: File) {
    const formData: FormData = new FormData()
    formData.append('file', file)
    this.http.put(API_USERS_MY_AVATAR, formData).subscribe({
      next: () => this.refreshAvatar(),
      error: (e) => this.layout.sendNotification('error', 'Configuration', 'Avatar', e)
    })
  }

  changePassword(userPasswordDto: UserUpdatePasswordDto, twoFaHeaders: HttpHeaders): Observable<any> {
    return this.http.put(API_USERS_MY_PASSWORD, userPasswordDto, { headers: twoFaHeaders })
  }

  changeLanguage(userLanguageDto: UserLanguageDto): Observable<any> {
    return this.http.put(API_USERS_MY_LANGUAGE, userLanguageDto)
  }

  changeNotification(userNotificationDto: UserNotificationDto): Observable<any> {
    return this.http.put(API_USERS_MY_NOTIFICATION, userNotificationDto)
  }

  changeOnlineStatus(status: USER_ONLINE_STATUS, store: boolean = true) {
    this.webSocket.emit(USERS_WS.EVENTS.ONLINE_STATUS, { status: status, store: store } satisfies EventChangeOnlineStatus)
  }

  receiveOnlineStatus(userOnlineStatus: EventUpdateOnlineStatus) {
    if (this.user.id === userOnlineStatus.userId) {
      this.user.onlineStatus = userOnlineStatus.status
    } else if (this.store.onlineUsers().length) {
      this.store.onlineUsers.update((users) =>
        users.map((user) =>
          user.id === userOnlineStatus.userId
            ? ({
                ...user,
                onlineStatus: userOnlineStatus.status
              } as UserOnlineModel)
            : user
        )
      )
    }
  }

  searchMembers(search: SearchMembersDto, omitPermissions: SPACE_OPERATION[] = []): Observable<MemberModel[]> {
    return this.http.request<Member[]>('search', USERS_ROUTE.BASE, { body: search }).pipe(
      map((members: Member[]) => members.map((m: Member) => new MemberModel(m, omitPermissions))),
      catchError(() => [])
    )
  }

  setMenusVisibility(menus: AppMenu[]) {
    for (const menu of menus) {
      if (menu.id) {
        menu.hide = !this.userHavePermission(menu.id)
        if (menu.hide) continue
      }
      if (menu.checks?.length) {
        menu.hide = !menu.checks.map((check) => (check.negate ? !this[check.prop][check.value] : this[check.prop][check.value])).every((r) => !!r)
      }
      if (menu.submenus?.length) {
        this.setMenusVisibility(menu.submenus)
      }
      // updates the files menu link based on user permissions
      if (menu.title === SPACES_TITLE.FILES) {
        for (const submenu of menu.submenus) {
          if (!submenu.hide) {
            menu.link = submenu.link
            break
          }
        }
      }
    }
  }

  refreshAvatar() {
    this.store.userAvatarUrl.next(myAvatarUrl())
  }

  checkAppStoreAvailability() {
    this.http.get<AppStoreManifest>(`${SYNC_ROUTE.BASE}/${SYNC_ROUTE.APP_STORE}`).subscribe({
      next: (manifest: AppStoreManifest) => this.store.appStoreManifest.set(manifest),
      error: (e: HttpErrorResponse) => console.error(e)
    })
  }

  listAppPasswords(twoFaHeaders: HttpHeaders): Observable<Omit<UserAppPassword, 'password'>[]> {
    return this.http.get<Omit<UserAppPassword, 'password'>[]>(API_USERS_MY_APP_PASSWORDS, { headers: twoFaHeaders })
  }

  generateAppPassword(userAppPasswordDto: UserAppPasswordDto, twoFaHeaders: HttpHeaders): Observable<UserAppPassword> {
    return this.http.post<UserAppPassword>(API_USERS_MY_APP_PASSWORDS, userAppPasswordDto, { headers: twoFaHeaders })
  }

  deleteAppPassword(name: string): Observable<void> {
    return this.http.delete<void>(`${API_USERS_MY_APP_PASSWORDS}/${name}`)
  }

  init2Fa(): Observable<TwoFaSetup> {
    return this.http.get<TwoFaSetup>(API_TWO_FA_ENABLE)
  }

  enable2Fa(twoFaVerifyWithPasswordDto: TwoFaVerifyWithPasswordDto): Observable<TwoFaEnableResult> {
    return this.http.post<TwoFaEnableResult>(API_TWO_FA_ENABLE, twoFaVerifyWithPasswordDto)
  }

  disable2Fa(twoFaVerifyDto: TwoFaVerifyWithPasswordDto): Observable<TwoFaVerifyResult> {
    return this.http.post<TwoFaVerifyResult>(API_TWO_FA_DISABLE, twoFaVerifyDto)
  }

  adminResetUser2Fa(userId: number, twoFaHeaders: HttpHeaders): Observable<TwoFaVerifyResult> {
    return this.http.post<TwoFaVerifyResult>(`${API_TWO_FA_ADMIN_RESET_USER}/${userId}`, null, { headers: twoFaHeaders })
  }

  async auth2FaVerifyDialog(withPassword = false): Promise<false | HttpHeaders> {
    // returns: false (dialog closed), undefined (no check), `HttpHeaders` (code and/or password to check)
    const TwoFaEnabled = this.store.server().twoFaEnabled && this.user.twoFaEnabled
    if (withPassword || TwoFaEnabled) {
      return new Promise((resolve) => {
        const modalRef: BsModalRef<UserAuth2FaVerifyDialogComponent> = this.layout.openDialog(
          UserAuth2FaVerifyDialogComponent,
          'xs',
          { initialState: { withPassword: withPassword, withTwoFaEnabled: TwoFaEnabled } },
          { keyboard: false }
        )
        modalRef.content.isValid = (result: false | HttpHeaders) => {
          resolve(result)
        }
      })
    }
    return undefined
  }

  private checkQuota(user: UserType) {
    if (user.isGuest || user.isLink) return
    if (user.storageQuota) {
      const remaining: number = Math.round((100 / user.storageQuota) * (user.storageQuota - user.storageUsage))
      if (remaining <= 1) {
        this.layout.sendNotification('error', 'Storage Quota', 'No more space available', null, { disableTimeOut: true, closeButton: true })
      } else if (remaining <= 5) {
        this.layout.sendNotification('warning', 'Storage Quota', this.layout.translateString('available_space_is_low', { nb: remaining }), null, {
          disableTimeOut: true,
          closeButton: true
        })
      } else if (remaining <= 10) {
        this.layout.sendNotification('info', 'Storage Quota', this.layout.translateString('available_space_is_low', { nb: remaining }), null, {
          disableTimeOut: true,
          closeButton: true
        })
      }
    }
  }
}
