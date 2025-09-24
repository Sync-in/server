/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpHeaders } from '@angular/common/http'
import { Component, inject, Input, OnInit } from '@angular/core'
import { FormGroup, ReactiveFormsModule, UntypedFormBuilder, Validators } from '@angular/forms'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faKey, faLock } from '@fortawesome/free-solid-svg-icons'
import { USER_PASSWORD_MIN_LENGTH } from '@sync-in-server/backend/src/applications/users/constants/user'
import { TWO_FA_CODE_LENGTH, TWO_FA_HEADER_CODE, TWO_FA_HEADER_PASSWORD } from '@sync-in-server/backend/src/authentication/constants/auth'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective } from 'angular-l10n'
import { InputPasswordComponent } from '../../../../common/components/input-password.component'
import { AutofocusDirective } from '../../../../common/directives/auto-focus.directive'
import { LayoutService } from '../../../../layout/layout.service'

@Component({
  selector: 'app-user-auth-2fa-verify-dialog',
  imports: [FaIconComponent, L10nTranslateDirective, AutofocusDirective, ReactiveFormsModule, InputPasswordComponent],
  templateUrl: 'user-auth-2fa-verify-dialog.component.html'
})
export class UserAuth2FaVerifyDialogComponent implements OnInit {
  @Input() withPassword = false
  @Input() withTwoFaEnabled = true
  isValid!: (result: false | HttpHeaders) => void // injected callback
  protected submitted = false
  protected hasError: any = null
  protected readonly icons = { faKey, faLock }
  protected readonly twoFaCodelength = TWO_FA_CODE_LENGTH
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected twoFaForm: FormGroup
  private readonly fb = inject(UntypedFormBuilder)
  private readonly layout = inject(LayoutService)

  ngOnInit() {
    this.twoFaForm = this.fb.group({
      totpCode: this.fb.control(
        '',
        this.withTwoFaEnabled ? [Validators.required, Validators.pattern(new RegExp(`^\\d{${TWO_FA_CODE_LENGTH}}$`))] : null
      ),
      password: this.fb.control('', this.withPassword ? [Validators.required, Validators.minLength(USER_PASSWORD_MIN_LENGTH)] : null)
    })
  }

  onClose(state: false | HttpHeaders = false) {
    this.isValid(state)
    this.layout.closeDialog()
  }

  onSubmit() {
    this.submitted = true
    const headers = new HttpHeaders({
      ...(this.withTwoFaEnabled ? { [TWO_FA_HEADER_CODE]: this.twoFaForm.value.totpCode } : {}),
      ...(this.withPassword ? { [TWO_FA_HEADER_PASSWORD]: this.twoFaForm.value.password } : {})
    })
    this.onClose(headers)
  }

  updatePassword(password: string) {
    this.twoFaForm.patchValue({ password: password })
  }
}
