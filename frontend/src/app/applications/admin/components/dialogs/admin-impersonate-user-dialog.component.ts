/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpErrorResponse } from '@angular/common/http'
import { Component, inject, Input } from '@angular/core'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faUserSecret } from '@fortawesome/free-solid-svg-icons'
import { USER_PASSWORD_MIN_LENGTH } from '@sync-in-server/backend/src/applications/users/constants/user'
import { UserPasswordDto } from '@sync-in-server/backend/src/applications/users/dto/user-password.dto'
import { LoginResponseDto } from '@sync-in-server/backend/src/authentication/dto/login-response.dto'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective } from 'angular-l10n'
import { InputPasswordComponent } from '../../../../common/components/input-password.component'
import { CapitalizePipe } from '../../../../common/pipes/capitalize.pipe'
import { LayoutService } from '../../../../layout/layout.service'
import { AdminService } from '../../admin.service'
import { AdminUserModel } from '../../models/admin-user.model'

@Component({
  selector: 'app-admin-impersonate-user-dialog',
  imports: [FaIconComponent, L10nTranslateDirective, ReactiveFormsModule, CapitalizePipe, InputPasswordComponent],
  templateUrl: 'admin-impersonate-user-dialog.component.html'
})
export class AdminImpersonateUserDialogComponent {
  @Input({ required: true }) user: AdminUserModel
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly layout = inject(LayoutService)
  protected submitted = false
  protected readonly icons = { faUserSecret }
  protected readonly passwordMinLength = USER_PASSWORD_MIN_LENGTH
  protected impersonateUserForm = new FormGroup<{
    password: FormControl<string>
  }>({ password: new FormControl('', Validators.required) })
  private readonly adminService = inject(AdminService)

  onSubmit() {
    this.submitted = true
    this.adminService.impersonateUser(this.user.id, { password: this.impersonateUserForm.value.password } satisfies UserPasswordDto).subscribe({
      next: (r: LoginResponseDto) => {
        this.layout.closeDialog()
        setTimeout(() => this.adminService.initImpersonateUser(r), 500)
      },
      error: (e: HttpErrorResponse) => {
        this.submitted = false
        this.layout.sendNotification('error', 'Impersonate identity', this.user.login, e)
      }
    })
  }
}
