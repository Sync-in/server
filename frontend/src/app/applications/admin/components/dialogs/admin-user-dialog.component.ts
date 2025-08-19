/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { TitleCasePipe } from '@angular/common'
import { HttpErrorResponse } from '@angular/common/http'
import { Component, EventEmitter, inject, Input, OnInit, Output } from '@angular/core'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faAddressCard, faShieldHalved, faSpinner, faUserPen, faUserPlus, faUsers } from '@fortawesome/free-solid-svg-icons'
import {
  USER_LOGIN_VALIDATION,
  USER_NOTIFICATION_TEXT,
  USER_PERMISSION,
  USER_PERMS_SEP,
  USER_ROLE
} from '@sync-in-server/backend/src/applications/users/constants/user'
import type { CreateUserDto, UpdateUserDto } from '@sync-in-server/backend/src/applications/users/dto/create-or-update-user.dto'
import type { SearchMembersDto } from '@sync-in-server/backend/src/applications/users/dto/search-members.dto'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { BsModalRef } from 'ngx-bootstrap/modal'
import { TabDirective, TabHeadingDirective, TabsetComponent } from 'ngx-bootstrap/tabs'
import { Observable } from 'rxjs'
import { take } from 'rxjs/operators'
import { InputPasswordComponent } from '../../../../common/components/input-password.component'
import { PasswordStrengthBarComponent } from '../../../../common/components/password-strength-bar.component'
import { StorageQuotaComponent } from '../../../../common/components/storage-quota.component'
import { StorageUsageComponent } from '../../../../common/components/storage-usage.component'
import { AutofocusDirective } from '../../../../common/directives/auto-focus.directive'
import { JoinPipe } from '../../../../common/pipes/join.pipe'
import { SplitPipe } from '../../../../common/pipes/split.pipe'
import { TimeDateFormatPipe } from '../../../../common/pipes/time-date-format.pipe'
import { LayoutService } from '../../../../layout/layout.service'
import { UserSearchComponent } from '../../../users/components/utils/user-search.component'
import { MemberModel } from '../../../users/models/member.model'
import { USER_ICON, USER_LANGUAGE_AUTO, USER_PASSWORD_CHANGE_TEXT } from '../../../users/user.constants'
import { AdminService } from '../../admin.service'
import { AdminUserModel } from '../../models/admin-user.model'
import { AdminPermissionsComponent } from '../utils/admin-permissions.component'
import { AdminUserDeleteDialogComponent } from './admin-user-delete-dialog.component'

@Component({
  selector: 'app-admin-user-dialog',
  imports: [
    FaIconComponent,
    L10nTranslateDirective,
    TabDirective,
    TabHeadingDirective,
    TabsetComponent,
    ReactiveFormsModule,
    InputPasswordComponent,
    PasswordStrengthBarComponent,
    TitleCasePipe,
    L10nTranslatePipe,
    StorageUsageComponent,
    StorageQuotaComponent,
    SplitPipe,
    JoinPipe,
    UserSearchComponent,
    AutofocusDirective,
    AdminPermissionsComponent,
    TimeDateFormatPipe
  ],
  templateUrl: 'admin-user-dialog.component.html'
})
export class AdminUserDialogComponent implements OnInit {
  @Input() user: AdminUserModel = null
  @Output() userChange = new EventEmitter<['add' | 'update' | 'delete', AdminUserModel]>()
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly layout = inject(LayoutService)
  protected submitted = false
  protected loading = false
  protected confirmDeletion = false
  protected tabView: undefined | 'permissions' | 'groups'
  protected readonly icons = { GROUPS: USER_ICON.GROUPS, faUserPlus, faUserPen, faSpinner, faAddressCard, faUsers, faShieldHalved }
  protected readonly allNotifications = Object.values(USER_NOTIFICATION_TEXT)
  protected readonly defaultPassword: string = this.layout.translateString(USER_PASSWORD_CHANGE_TEXT)
  protected readonly languages: string[] = this.layout.getLanguages(true)
  protected userForm: FormGroup<{
    login: FormControl<string>
    email: FormControl<string>
    firstName: FormControl<string>
    lastName: FormControl<string>
    password: FormControl<string>
    language: FormControl<string>
    notification: FormControl<number>
    isActive: FormControl<boolean>
    isAdmin: FormControl<boolean>
    storageQuota: FormControl<number>
    groups: FormControl<MemberModel[]>
    applications: FormControl<USER_PERMISSION[]>
  }>
  private readonly adminService = inject(AdminService)

  ngOnInit() {
    this.userForm = new FormGroup({
      login: new FormControl<string>(this.user?.login || '', [Validators.required, Validators.pattern(USER_LOGIN_VALIDATION)]),
      email: new FormControl<string>(this.user?.email || '', [Validators.required, Validators.maxLength(255), Validators.email]),
      firstName: new FormControl<string>(this.user?.firstName || '', [Validators.required, Validators.maxLength(255)]),
      lastName: new FormControl<string>(this.user?.lastName || '', Validators.maxLength(255)),
      password: new FormControl<string>(this.user ? this.defaultPassword : '', Validators.maxLength(255)),
      language: new FormControl<string>(this.user?.language || null),
      notification: new FormControl<number>(
        this.user?.notification || Object.values(USER_NOTIFICATION_TEXT).indexOf(USER_NOTIFICATION_TEXT.APPLICATION_EMAIL)
      ),
      isActive: new FormControl<boolean>(this.user ? this.user.isActive : true),
      isAdmin: new FormControl<boolean>(this.user ? this.user.isAdmin : false),
      storageQuota: new FormControl<number>(this.user?.storageQuota || null),
      groups: new FormControl<MemberModel[]>(this.user?.groups || []),
      applications: new FormControl<USER_PERMISSION[]>(this.user?.applications || [])
    })
  }

  searchMembers(query: string): Observable<MemberModel[]> {
    const search: SearchMembersDto = {
      search: query,
      onlyGroups: true,
      excludePersonalGroups: true,
      withPermissions: true,
      ignoreGroupIds: this.userForm.value.groups.map((m: MemberModel) => m.id)
    }
    return this.adminService.searchMembers(search)
  }

  updateApplications(apps: USER_PERMISSION[]) {
    this.userForm.controls.applications.setValue(apps)
    this.userForm.controls.applications.markAsDirty()
  }

  updatePassword(password: string) {
    this.userForm.controls.password.setValue(password)
    this.userForm.controls.password.markAsDirty()
  }

  updateMembers(members: MemberModel[]) {
    this.userForm.controls.groups.setValue(members)
    this.userForm.controls.groups.markAsDirty()
  }

  updateQuota(quota: number) {
    this.userForm.controls.storageQuota.setValue(quota)
    this.userForm.controls.storageQuota.markAsDirty()
  }

  onCancel() {
    if (this.confirmDeletion) {
      this.confirmDeletion = false
    } else {
      this.layout.closeDialog()
    }
  }

  onSubmit() {
    this.submitted = true
    if (this.confirmDeletion) {
      // delete
      const modalRef: BsModalRef<AdminUserDeleteDialogComponent> = this.layout.openDialog(AdminUserDeleteDialogComponent, 'sm', {
        initialState: { user: this.user } as AdminUserDeleteDialogComponent
      })
      modalRef.content.wasDeleted.pipe(take(1)).subscribe((wasDeleted) => {
        if (wasDeleted) {
          this.userChange.emit(['delete', this.user])
          this.layout.closeDialog()
        } else {
          this.confirmDeletion = false
          this.submitted = false
        }
      })
    } else if (!this.user) {
      // create
      this.adminService.createUser(this.makeDto(true)).subscribe({
        next: (u: AdminUserModel) => {
          this.userChange.emit(['add', u])
          this.layout.sendNotification('success', 'User created', this.userForm.value.login)
          this.layout.closeDialog()
        },
        error: (e: HttpErrorResponse) => this.onError(e)
      })
    } else {
      // update
      this.adminService.updateUser(this.user.id, this.makeDto()).subscribe({
        next: (u: AdminUserModel) => {
          this.userChange.emit(['update', u])
          this.layout.sendNotification('success', 'User updated', this.userForm.value.login)
          this.layout.closeDialog()
        },
        error: (e: HttpErrorResponse) => this.onError(e)
      })
    }
  }

  private makeDto(create: true): CreateUserDto
  private makeDto(create?: false): UpdateUserDto
  private makeDto(create = false): CreateUserDto | UpdateUserDto {
    let dto = {}
    if (create) {
      dto = this.userForm.value
    } else {
      for (const k in this.userForm.controls) {
        if (this.userForm.controls[k].dirty) {
          dto[k] = this.userForm.controls[k].value
        }
      }
    }
    for (const k in dto) {
      switch (k) {
        case 'language':
          dto[k] = dto[k] === USER_LANGUAGE_AUTO ? null : dto[k]
          break
        case 'isAdmin':
          dto['role'] = dto[k] ? USER_ROLE.ADMINISTRATOR : USER_ROLE.USER
          break
        case 'applications':
          dto['permissions'] = dto[k].join(USER_PERMS_SEP)
          break
        case 'groups':
          dto[k] = dto[k].map((m: MemberModel) => m.id)
          break
      }
    }
    return dto
  }

  private onError(e: HttpErrorResponse) {
    this.layout.sendNotification('error', 'Group error', this.userForm.value.login, e)
    this.submitted = false
  }
}
