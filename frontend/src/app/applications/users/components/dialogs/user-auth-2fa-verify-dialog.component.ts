/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Component, inject, Input } from '@angular/core'
import { FormGroup, ReactiveFormsModule, UntypedFormBuilder, Validators } from '@angular/forms'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faKey, faLock } from '@fortawesome/free-solid-svg-icons'
import { TWO_FA_CODE_LENGTH } from '@sync-in-server/backend/src/authentication/constants/auth'
import { TwoFaVerifyResult } from '@sync-in-server/backend/src/authentication/interfaces/two-fa-setup.interface'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective } from 'angular-l10n'
import { InputPasswordComponent } from '../../../../common/components/input-password.component'
import { AutofocusDirective } from '../../../../common/directives/auto-focus.directive'
import { LayoutService } from '../../../../layout/layout.service'
import { UserTwoFaVerify } from '../../interfaces/user.interface'
import { UserService } from '../../user.service'

@Component({
  selector: 'app-user-auth-2fa-verify-dialog',
  imports: [FaIconComponent, L10nTranslateDirective, AutofocusDirective, ReactiveFormsModule, InputPasswordComponent],
  templateUrl: 'user-auth-2fa-verify-dialog.component.html'
})
export class UserAuth2FaVerifyDialogComponent {
  @Input() withPassword = false
  isValid!: (result: false | UserTwoFaVerify) => void // injected callback
  protected submitted = false
  protected hasError: any = null
  protected readonly icons = { faKey, faLock }
  protected readonly twoFaCodelength = TWO_FA_CODE_LENGTH
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  private readonly userService = inject(UserService)
  private readonly fb = inject(UntypedFormBuilder)
  protected twoFaForm: FormGroup = this.fb.group({
    totpCode: this.fb.control('', [Validators.required, Validators.pattern(new RegExp(`^\\d{${TWO_FA_CODE_LENGTH}}$`))]),
    password: this.fb.control('')
  })
  private readonly layout = inject(LayoutService)

  onClose(state: false | UserTwoFaVerify = false) {
    this.isValid(state)
    this.layout.closeDialog()
  }

  onSubmit() {
    this.submitted = true
    this.userService.verify2Fa({ code: this.twoFaForm.value.totpCode }).subscribe({
      next: (res: TwoFaVerifyResult) => {
        if (res.success) {
          this.onClose({ totpCode: this.twoFaForm.value.totpCode, password: this.twoFaForm.value.password })
        } else {
          this.hasError = 'Incorrect code or password'
        }
        setTimeout(() => (this.submitted = false), 1000)
      },
      error: (e) => {
        this.hasError = e.error ? e.error.message : e
        setTimeout(() => (this.submitted = false), 1000)
      }
    })
  }
}
