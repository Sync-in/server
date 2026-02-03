import { Component, inject } from '@angular/core'
import { FormGroup, ReactiveFormsModule, UntypedFormBuilder, Validators } from '@angular/forms'
import { ActivatedRoute, Router } from '@angular/router'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faKey, faLock, faQrcode, faUserAlt } from '@fortawesome/free-solid-svg-icons'
import { USER_PASSWORD_MIN_LENGTH } from '@sync-in-server/backend/src/applications/users/constants/user'
import { TWO_FA_CODE_LENGTH } from '@sync-in-server/backend/src/authentication/constants/auth'
import { API_OIDC_CALLBACK } from '@sync-in-server/backend/src/authentication/constants/routes'
import { OAuthDesktopPortParam } from '@sync-in-server/backend/src/authentication/providers/oidc/auth-oidc-desktop.constants'
import type { AuthOIDCSettings } from '@sync-in-server/backend/src/authentication/providers/oidc/auth-oidc.interfaces'
import type { TwoFaResponseDto, TwoFaVerifyDto } from '@sync-in-server/backend/src/authentication/providers/two-fa/auth-two-fa.dtos'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { finalize } from 'rxjs/operators'
import { logoDarkUrl } from '../applications/files/files.constants'
import { RECENTS_PATH } from '../applications/recents/recents.constants'
import { AutofocusDirective } from '../common/directives/auto-focus.directive'
import type { AuthResult } from './auth.interface'
import { AuthService } from './auth.service'

@Component({
  selector: 'app-auth',
  templateUrl: 'auth.component.html',
  imports: [AutofocusDirective, ReactiveFormsModule, FaIconComponent, L10nTranslateDirective, L10nTranslatePipe]
})
export class AuthComponent {
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly icons = { faLock, faUserAlt, faKey, faQrcode }
  protected twoFaCodelength = TWO_FA_CODE_LENGTH
  protected logoUrl = logoDarkUrl
  protected hasError: any = null
  protected submitted = false
  protected OIDCSubmitted = false
  protected twoFaVerify = false
  private route = inject(ActivatedRoute)
  protected oidcSettings: AuthOIDCSettings | false = this.route.snapshot.data.authSettings
  private readonly router = inject(Router)
  private readonly auth = inject(AuthService)
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

  constructor() {
    if (this.oidcSettings && this.oidcSettings.autoRedirect) {
      void this.loginWithOIDC()
    }
  }

  onSubmit() {
    this.submitted = true
    this.auth
      .login(this.loginForm.value.username, this.loginForm.value.password)
      .pipe(finalize(() => setTimeout(() => (this.submitted = false), 1500)))
      .subscribe({
        next: (res: AuthResult) => this.isLogged(res),
        error: (e) => this.isLogged({ success: false, message: e.error ? e.error.message : e })
      })
  }

  async onSubmit2Fa() {
    this.submitted = true
    const code = this.twoFaForm.value.isRecoveryCode ? this.twoFaForm.value.recoveryCode : this.twoFaForm.value.totpCode

    if (this.auth.electron.enabled) {
      this.auth.electron.register(this.loginForm.value.username, this.loginForm.value.password, code).subscribe({
        next: (res: AuthResult) => this.is2FaVerified(res as TwoFaResponseDto),
        error: (e) => this.is2FaVerified({ success: false, message: e.error ? e.error.message : e } as TwoFaResponseDto)
      })
    } else {
      this.auth.loginWith2Fa({ code: code, isRecoveryCode: this.twoFaForm.value.isRecoveryCode } satisfies TwoFaVerifyDto).subscribe({
        next: (res: TwoFaResponseDto) => this.is2FaVerified(res),
        error: (e) => this.is2FaVerified({ success: false, message: e.error ? e.error.message : e } as TwoFaResponseDto)
      })
    }
  }

  onCancel2Fa() {
    this.auth.logout()
    this.twoFaForm.patchValue({ totpCode: '', recoveryCode: '' })
    this.twoFaVerify = false
    this.submitted = false
    this.hasError = null
  }

  async loginWithOIDC() {
    if (!this.oidcSettings) return
    if (!this.auth.electron.enabled) {
      window.location.assign(this.oidcSettings.loginUrl)
      return
    }
    this.OIDCSubmitted = true
    try {
      const desktopPort = await this.auth.electron.startOIDCDesktopAuth()

      if (!desktopPort) {
        this.OIDCSubmitted = false
        console.error('OIDC desktop auth failed')
        return
      }

      // Called when the OIDC provider redirects to desktop app
      this.auth.electron
        .waitOIDCDesktopCallbackParams()
        .then((callbackParams: Record<string, string>) => {
          // Receive callback params from desktop app and send it to backend to be authenticated.
          const params = new URLSearchParams(callbackParams)
          // Indicates the desktop app port used to reconstruct the redirect URI expected by the backend
          params.set(OAuthDesktopPortParam, String(desktopPort))
          window.location.assign(`${API_OIDC_CALLBACK}?${params.toString()}`)
          // Show desktop app window
          this.auth.electron.setActiveAndShow()
        })
        .catch((e: Error) => {
          this.OIDCSubmitted = false
          console.error('Unavailable OIDC desktop callback params:', e)
        })

      // With the desktop app, navigation to the OIDC provider is intercepted and opened in the user's browser.
      // The backend sends the oidc cookies to desktop app before the redirection.
      window.location.assign(`${this.oidcSettings.loginUrl}?${this.auth.electron.genParamOIDCDesktopPort(desktopPort)}`)
    } catch (e) {
      this.OIDCSubmitted = false
      console.error(e)
    }
  }

  private is2FaVerified(res: TwoFaResponseDto) {
    if (res.success) {
      if (!this.auth.electron.enabled) {
        // Web: in this case, the user and tokens are provided
        this.auth.initUserFromResponse(res)
      }
      this.isLogged({ success: true, message: res.message })
    } else {
      this.hasError = res.message || 'Unable to verify code'
      this.submitted = false
    }
    this.twoFaForm.patchValue({ totpCode: '', recoveryCode: '' })
  }

  private isLogged(res: AuthResult) {
    if (res.success) {
      this.hasError = null
      if (res.twoFaEnabled) {
        this.twoFaVerify = true
        if (this.auth.electron.enabled) {
          // Do not clear the password; it will be used to register the client.
          return
        }
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
