/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpClient, HttpHeaders } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { Router } from '@angular/router'
import {
  ADMIN_USERS_ROUTE,
  API_ADMIN_GROUPS,
  API_ADMIN_GROUPS_BROWSE,
  API_ADMIN_GUESTS,
  API_ADMIN_GUESTS_LIST,
  API_ADMIN_IMPERSONATE,
  API_ADMIN_MEMBERS,
  API_ADMIN_PERSONAL_GROUPS_BROWSE,
  API_ADMIN_USERS,
  API_ADMIN_USERS_LIST
} from '@sync-in-server/backend/src/applications/users/constants/routes'
import type { CreateOrUpdateGroupDto } from '@sync-in-server/backend/src/applications/users/dto/create-or-update-group.dto'
import type {
  CreateUserDto,
  UpdateUserDto,
  UpdateUserFromGroupDto
} from '@sync-in-server/backend/src/applications/users/dto/create-or-update-user.dto'
import type { DeleteUserDto } from '@sync-in-server/backend/src/applications/users/dto/delete-user.dto'
import type { SearchMembersDto } from '@sync-in-server/backend/src/applications/users/dto/search-members.dto'
import type { AdminGroup } from '@sync-in-server/backend/src/applications/users/interfaces/admin-group.interface'
import type { AdminUser } from '@sync-in-server/backend/src/applications/users/interfaces/admin-user.interface'
import type { GroupBrowse } from '@sync-in-server/backend/src/applications/users/interfaces/group-browse.interface'
import type { GuestUser } from '@sync-in-server/backend/src/applications/users/interfaces/guest-user.interface'
import type { Member } from '@sync-in-server/backend/src/applications/users/interfaces/member.interface'
import type { LoginResponseDto } from '@sync-in-server/backend/src/authentication/dto/login-response.dto'
import { catchError, map, Observable } from 'rxjs'
import { AuthService } from '../../auth/auth.service'
import { GroupBrowseModel } from '../users/models/group-browse.model'
import { GuestUserModel } from '../users/models/guest.model'
import { MemberModel } from '../users/models/member.model'
import { USER_PATH } from '../users/user.constants'
import { AdminGroupModel } from './models/admin-group.model'
import { AdminUserModel } from './models/admin-user.model'

@Injectable({
  providedIn: 'root'
})
export class AdminService {
  private readonly http = inject(HttpClient)
  private readonly router = inject(Router)
  private readonly authService = inject(AuthService)

  listUsers(areGuests = false): Observable<AdminUserModel[]> {
    return this.http
      .get<AdminUser[] | GuestUser[]>(areGuests ? API_ADMIN_GUESTS_LIST : API_ADMIN_USERS_LIST)
      .pipe(map((users) => users.map((u: AdminUser | GuestUser) => new AdminUserModel(u))))
  }

  getUser(userId: number, isGuest?: false): Observable<AdminUserModel>
  getUser(userId: number, isGuest: true): Observable<GuestUserModel>
  getUser(userId: number, isGuest = false): Observable<AdminUserModel | GuestUserModel> {
    return this.http
      .get<AdminUser | GuestUser>(`${isGuest ? API_ADMIN_GUESTS : API_ADMIN_USERS}/${userId}`)
      .pipe(map((u) => (isGuest ? new GuestUserModel(u) : new AdminUserModel(u))))
  }

  createUser(createUserDto: CreateUserDto, twoFaHeaders: HttpHeaders, isGuest?: false): Observable<AdminUserModel>
  createUser(createUserDto: CreateUserDto, twoFaHeaders: HttpHeaders, isGuest: true): Observable<GuestUserModel>
  createUser(createUserDto: CreateUserDto, twoFaHeaders: HttpHeaders, isGuest = false): Observable<AdminUserModel | GuestUserModel> {
    return this.http
      .post<AdminUser | GuestUser>(isGuest ? API_ADMIN_GUESTS : API_ADMIN_USERS, createUserDto, { headers: twoFaHeaders })
      .pipe(map((u) => (isGuest ? new GuestUserModel(u) : new AdminUserModel(u))))
  }

  updateUser(userId: number, updateUserDto: UpdateUserDto, twoFaHeaders: HttpHeaders, isGuest?: false): Observable<AdminUserModel>
  updateUser(userId: number, updateUserDto: UpdateUserDto, twoFaHeaders: HttpHeaders, isGuest: true): Observable<GuestUserModel>
  updateUser(userId: number, updateUserDto: UpdateUserDto, twoFaHeaders: HttpHeaders, isGuest = false): Observable<AdminUserModel | GuestUserModel> {
    return this.http
      .put<AdminUser | GuestUser>(`${isGuest ? API_ADMIN_GUESTS : API_ADMIN_USERS}/${userId}`, updateUserDto, { headers: twoFaHeaders })
      .pipe(map((u) => (isGuest ? new GuestUserModel(u) : new AdminUserModel(u))))
  }

  deleteUser(userId: number, deleteUserDto: DeleteUserDto, twoFaHeaders: HttpHeaders): Observable<void> {
    return this.http.request<void>('delete', `${deleteUserDto.isGuest ? API_ADMIN_GUESTS : API_ADMIN_USERS}/${userId}`, {
      headers: twoFaHeaders,
      body: deleteUserDto
    })
  }

  browseGroup(name?: string, personalGroups = false): Observable<GroupBrowseModel> {
    return this.http
      .get<GroupBrowse>(`${personalGroups ? API_ADMIN_PERSONAL_GROUPS_BROWSE : API_ADMIN_GROUPS_BROWSE}${name ? `/${name}` : ''}`)
      .pipe(map((browse) => new GroupBrowseModel(browse)))
  }

  getGroup(groupId: number): Observable<AdminGroupModel> {
    return this.http.get<AdminGroup>(`${API_ADMIN_GROUPS}/${groupId}`).pipe(map((g) => new AdminGroupModel(g)))
  }

  createGroup(createGroupDto: CreateOrUpdateGroupDto): Observable<AdminGroupModel> {
    return this.http.post<AdminGroup>(API_ADMIN_GROUPS, createGroupDto).pipe(map((g) => new AdminGroupModel(g)))
  }

  updateGroup(groupId: number, updateGroupDto: CreateOrUpdateGroupDto): Observable<AdminGroupModel> {
    return this.http.put<AdminGroup>(`${API_ADMIN_GROUPS}/${groupId}`, updateGroupDto).pipe(map((g) => new AdminGroupModel(g)))
  }

  deleteGroup(groupId: number): Observable<void> {
    return this.http.delete<void>(`${API_ADMIN_GROUPS}/${groupId}`)
  }

  addUsersToGroup(groupId: number, userIds: number[]): Observable<void> {
    return this.http.patch<void>(`${API_ADMIN_GROUPS}/${groupId}/${ADMIN_USERS_ROUTE.USERS}`, userIds)
  }

  updateUserFromGroup(groupId: number, userId: number, updateUserFromGroupDto: UpdateUserFromGroupDto): Observable<void> {
    return this.http.patch<void>(`${API_ADMIN_GROUPS}/${groupId}/${ADMIN_USERS_ROUTE.USERS}/${userId}`, updateUserFromGroupDto)
  }

  removeUserFromGroup(groupId: number, userId: number): Observable<void> {
    return this.http.delete<void>(`${API_ADMIN_GROUPS}/${groupId}/${ADMIN_USERS_ROUTE.USERS}/${userId}`)
  }

  searchMembers(search: SearchMembersDto, removeDescription = false): Observable<MemberModel[]> {
    return this.http.request<Member[]>('search', API_ADMIN_MEMBERS, { body: search }).pipe(
      map((members: Member[]) =>
        members.map((m: Member) => {
          if (removeDescription) {
            delete m.description
          }
          return new MemberModel(m)
        })
      ),
      catchError(() => [])
    )
  }

  impersonateUser(userId: number, twoFaHeaders: HttpHeaders): Observable<LoginResponseDto> {
    return this.http.post<LoginResponseDto>(`${API_ADMIN_IMPERSONATE}/${userId}`, null, { headers: twoFaHeaders })
  }

  initImpersonateUser(r: LoginResponseDto) {
    this.authService.initUserFromResponse(r, true)
    this.router.navigate([USER_PATH.BASE, USER_PATH.ACCOUNT]).catch(console.error)
  }
}
