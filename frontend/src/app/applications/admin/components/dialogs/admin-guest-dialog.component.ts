/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { TitleCasePipe } from '@angular/common'
import { HttpErrorResponse } from '@angular/common/http'
import { Component, inject } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { USER_ROLE } from '@sync-in-server/backend/src/applications/users/constants/user'
import type { DeleteUserDto } from '@sync-in-server/backend/src/applications/users/dto/delete-user.dto'
import type { SearchMembersDto } from '@sync-in-server/backend/src/applications/users/dto/search-members.dto'
import { L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { TabDirective, TabHeadingDirective, TabsetComponent } from 'ngx-bootstrap/tabs'
import { Observable } from 'rxjs'
import { InputPasswordComponent } from '../../../../common/components/input-password.component'
import { PasswordStrengthBarComponent } from '../../../../common/components/password-strength-bar.component'
import { AutofocusDirective } from '../../../../common/directives/auto-focus.directive'
import { TimeDateFormatPipe } from '../../../../common/pipes/time-date-format.pipe'
import { UserGuestDialogComponent } from '../../../users/components/dialogs/user-guest-dialog.component'
import { UserSearchComponent } from '../../../users/components/utils/user-search.component'
import { GuestUserModel } from '../../../users/models/guest.model'
import { MemberModel } from '../../../users/models/member.model'
import { AdminService } from '../../admin.service'

@Component({
  selector: 'app-admin-guest-dialog',
  imports: [
    FaIconComponent,
    L10nTranslateDirective,
    TimeDateFormatPipe,
    ReactiveFormsModule,
    InputPasswordComponent,
    PasswordStrengthBarComponent,
    AutofocusDirective,
    AutofocusDirective,
    PasswordStrengthBarComponent,
    InputPasswordComponent,
    TimeDateFormatPipe,
    L10nTranslatePipe,
    TitleCasePipe,
    UserSearchComponent,
    TabsetComponent,
    TabDirective,
    TabHeadingDirective
  ],
  templateUrl: '../../../users/components/dialogs/user-guest-dialog.component.html'
})
export class AdminGuestDialogComponent extends UserGuestDialogComponent {
  private readonly adminService = inject(AdminService)
  constructor() {
    super()
  }

  override searchMembers(query: string): Observable<MemberModel[]> {
    const search: SearchMembersDto = {
      search: query,
      ignoreUserIds: this.guestForm.value.managers.map((m: MemberModel) => m.id),
      usersRole: USER_ROLE.USER,
      onlyUsers: true
    }
    return this.adminService.searchMembers(search)
  }

  override async onSubmit() {
    this.submitted = true
    if (this.confirmDeletion) {
      // delete
      const auth2FaHeaders = await this.userService.auth2FaVerifyDialog(true)
      if (auth2FaHeaders === false) {
        return
      }
      this.adminService.deleteUser(this.guest.id, { deleteSpace: true, isGuest: true } satisfies DeleteUserDto, auth2FaHeaders).subscribe({
        next: () => {
          this.guestChange.emit(['delete', this.guest])
          this.layout.sendNotification('success', 'Guest deleted', this.guest.login)
          this.layout.closeDialog()
        },
        error: (e: HttpErrorResponse) => this.onError(e)
      })
    } else if (!this.guest) {
      // create
      const auth2FaHeaders = await this.userService.auth2FaVerifyDialog()
      if (auth2FaHeaders === false) {
        return
      }
      this.adminService.createUser(this.makeDto(true), auth2FaHeaders, true).subscribe({
        next: (g: GuestUserModel) => {
          this.guestChange.emit(['add', g])
          this.layout.sendNotification('success', 'Guest created', this.guestForm.value.login)
          this.layout.closeDialog()
        },
        error: (e: HttpErrorResponse) => this.onError(e)
      })
    } else {
      // update
      const updateDto = this.makeDto()
      if (!Object.keys(updateDto).length) {
        this.loading = false
        this.submitted = false
        return
      }
      const auth2FaHeaders = await this.userService.auth2FaVerifyDialog()
      if (auth2FaHeaders === false) {
        return
      }
      this.adminService.updateUser(this.guest.id, updateDto, auth2FaHeaders, true).subscribe({
        next: (g: GuestUserModel) => {
          if (g) {
            this.guestChange.emit(['update', g])
          } else {
            this.guestChange.emit(['delete', this.guest])
          }
          this.layout.sendNotification('success', 'Guest updated', this.guestForm.value.login)
          this.layout.closeDialog()
        },
        error: (e: HttpErrorResponse) => this.onError(e)
      })
    }
  }
}
