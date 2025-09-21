/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpErrorResponse } from '@angular/common/http'
import { Component, EventEmitter, inject, Input, Output } from '@angular/core'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faLockOpen } from '@fortawesome/free-solid-svg-icons'
import { USER_PASSWORD_MIN_LENGTH } from '@sync-in-server/backend/src/applications/users/constants/user'
import type { TwoFaVerifyResult } from '@sync-in-server/backend/src/authentication/interfaces/two-fa-setup.interface'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective } from 'angular-l10n'
import { InputPasswordComponent } from '../../../../common/components/input-password.component'
import { CapitalizePipe } from '../../../../common/pipes/capitalize.pipe'
import { LayoutService } from '../../../../layout/layout.service'
import { UserService } from '../../../users/user.service'
import { AdminUserModel } from '../../models/admin-user.model'

@Component({
  selector: 'app-admin-reset-user-two-fa-dialog',
  imports: [FaIconComponent, L10nTranslateDirective, ReactiveFormsModule, CapitalizePipe, InputPasswordComponent],
  templateUrl: 'admin-reset-user-two-fa-dialog.component.html'
})
export class AdminResetUserTwoFaDialogComponent {
  @Input({ required: true }) user: AdminUserModel
  @Output() wasReset = new EventEmitter<boolean>()
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly layout = inject(LayoutService)
  protected readonly icons = { faLockOpen }
  protected readonly passwordMinLength = USER_PASSWORD_MIN_LENGTH
  protected adminForm = new FormGroup<{
    password: FormControl<string>
  }>({ password: new FormControl('', Validators.required) })
  protected submitted = false
  private readonly userService = inject(UserService)

  async onSubmit() {
    this.submitted = true
    const auth2Fa = await this.userService.auth2FaVerifyDialog()
    if (auth2Fa === false) {
      this.layout.closeDialog()
      return
    }
    const totpCode = auth2Fa === true ? undefined : auth2Fa.totpCode
    this.userService.adminResetUser2Fa(this.user.id, { password: this.adminForm.value.password }, totpCode).subscribe({
      next: (verify: TwoFaVerifyResult) => {
        this.wasReset.emit(verify.success)
        if (verify.success) {
          this.layout.closeDialog()
        } else {
          this.submitted = false
          this.layout.sendNotification('error', 'Reset Two-Factor Authentication', verify.message)
        }
      },
      error: (e: HttpErrorResponse) => {
        this.submitted = false
        this.layout.sendNotification('error', 'Reset Two-Factor Authentication', this.user.login, e)
      }
    })
  }
}
