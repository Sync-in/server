/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { NgOptimizedImage } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormGroup, ReactiveFormsModule, UntypedFormBuilder, Validators } from '@angular/forms'
import { Router } from '@angular/router'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faKey, faLock, faQrcode, faUserAlt } from '@fortawesome/free-solid-svg-icons'
import { USER_PASSWORD_MIN_LENGTH } from '@sync-in-server/backend/src/applications/users/constants/user'
import { TWO_FA_CODE_LENGTH } from '@sync-in-server/backend/src/authentication/constants/auth'
import { TwoFaResponseDto } from '@sync-in-server/backend/src/authentication/dto/login-response.dto'
import { TwoFaVerifyDto } from '@sync-in-server/backend/src/authentication/dto/two-fa-verify.dto'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { finalize } from 'rxjs/operators'
import { logoDarkUrl } from '../applications/files/files.constants'
import { RECENTS_PATH } from '../applications/recents/recents.constants'
import { AutofocusDirective } from '../common/directives/auto-focus.directive'
import { AuthService } from './auth.service'

@Component({
  selector: 'app-auth',
  templateUrl: 'auth.component.html',
  imports: [AutofocusDirective, ReactiveFormsModule, FaIconComponent, L10nTranslateDirective, L10nTranslatePipe, NgOptimizedImage]
})
export class AuthComponent {
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly icons = { faLock, faUserAlt, faKey, faQrcode }
  protected twoFaCodelength = TWO_FA_CODE_LENGTH
  protected logoUrl = logoDarkUrl
  protected hasError: any = null
  protected submitted = false
  protected twoFaVerify = false
  private readonly fb = inject(UntypedFormBuilder)
  protected loginForm: FormGroup = this.fb.group({
    username: this.fb.control('', [Validators.required]),
    password: this.fb.control('', [Validators.required])
  })
  protected twoFaForm: FormGroup = this.fb.group({
    totpCode: this.fb.control('', [Validators.required, Validators.pattern(new RegExp(`^\\d{${TWO_FA_CODE_LENGTH}}$`))]),
    recoveryCode: this.fb.control('', [Validators.required, Validators.minLength(USER_PASSWORD_MIN_LENGTH)]),
    isRecoveryCode: this.fb.control(false)
  })
  private readonly router = inject(Router)
  private readonly auth = inject(AuthService)

  onSubmit() {
    this.submitted = true
    this.auth
      .login(this.loginForm.value.username, this.loginForm.value.password)
      .pipe(finalize(() => setTimeout(() => (this.submitted = false), 1500)))
      .subscribe({
        next: (res: { success: boolean; message: any; twoFaEnabled?: boolean }) => this.isLogged(res),
        error: (e) => this.isLogged({ success: false, message: e.error ? e.error.message : e })
      })
  }

  onSubmit2Fa() {
    this.submitted = true
    const verifyCode: TwoFaVerifyDto = {
      code: this.twoFaForm.value.isRecoveryCode ? this.twoFaForm.value.recoveryCode : this.twoFaForm.value.totpCode,
      isRecoveryCode: this.twoFaForm.value.isRecoveryCode
    }
    this.auth.loginWith2Fa(verifyCode).subscribe({
      next: (res: TwoFaResponseDto) => this.is2FaVerified(res),
      error: (e) => this.is2FaVerified({ success: false, message: e.error ? e.error.message : e } as TwoFaResponseDto)
    })
  }

  onCancel2Fa() {
    this.auth.logout()
    this.twoFaForm.patchValue({ totpCode: '', recoveryCode: '' })
    this.twoFaVerify = false
    this.submitted = false
    this.hasError = null
  }

  is2FaVerified(res: TwoFaResponseDto) {
    if (res.success) {
      // In this case, the user and tokens are provided
      this.auth.initUserFromResponse(res)
      this.isLogged({ success: true, message: res.message })
    } else {
      this.hasError = res.message || 'Unable to verify code'
      this.submitted = false
    }
    this.twoFaForm.patchValue({ totpCode: '', recoveryCode: '' })
  }

  isLogged(res: { success: boolean; message: any; twoFaEnabled?: boolean }) {
    if (res.success) {
      this.hasError = null
      if (res.twoFaEnabled) {
        this.twoFaVerify = true
      } else if (this.auth.returnUrl) {
        this.router.navigateByUrl(this.auth.returnUrl).then(() => {
          this.auth.returnUrl = null
          this.loginForm.reset()
        })
      } else {
        this.router.navigate([RECENTS_PATH.BASE]).then(() => this.loginForm.reset())
      }
    } else {
      this.hasError = res.message || 'Server connection error'
      this.submitted = false
    }
    this.loginForm.patchValue({ password: '' })
  }
}
