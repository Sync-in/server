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
import { faLock, faUserAlt } from '@fortawesome/free-solid-svg-icons'
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
  protected readonly icons = { faLock, faUserAlt }
  protected logoUrl = logoDarkUrl
  protected loginForm: FormGroup
  protected hasError: any = null
  protected submitted = false
  private readonly fb = inject(UntypedFormBuilder)
  private readonly router = inject(Router)
  private readonly auth = inject(AuthService)

  constructor() {
    const fb = this.fb

    this.loginForm = fb.group({
      username: this.fb.control('', [Validators.required]),
      password: this.fb.control('', [Validators.required])
    })
  }

  onSubmit() {
    this.submitted = true
    this.auth
      .login(this.loginForm.value.username, this.loginForm.value.password)
      .pipe(finalize(() => setTimeout(() => (this.submitted = false), 1500)))
      .subscribe({
        next: (res) => this.isLogged(res.success, res.message),
        error: (e) => this.isLogged(false, e.error ? e.error.message : e)
      })
  }

  isLogged(success: boolean, errorMsg: string = null) {
    if (success) {
      if (this.auth.returnUrl) {
        this.router.navigateByUrl(this.auth.returnUrl).then(() => {
          this.auth.returnUrl = null
          this.loginForm.reset()
        })
      } else {
        this.router.navigate([RECENTS_PATH.BASE]).then(() => this.loginForm.reset())
      }
    } else {
      this.hasError = errorMsg || 'Server connection error'
      this.submitted = false
    }
    this.loginForm.patchValue({ password: '' })
  }
}
