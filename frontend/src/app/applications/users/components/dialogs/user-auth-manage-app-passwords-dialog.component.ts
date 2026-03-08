import { HttpErrorResponse, HttpHeaders } from '@angular/common/http'
import { Component, EventEmitter, inject, Input, Output } from '@angular/core'
import { FormGroup, ReactiveFormsModule, UntypedFormBuilder, Validators } from '@angular/forms'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faCopy, faKey } from '@fortawesome/free-solid-svg-icons'
import { UserAppPassword } from '@sync-in-server/backend/src/applications/users/interfaces/user-secrets.interface'
import { AUTH_SCOPE } from '@sync-in-server/backend/src/authentication/constants/scope'
import { createLightSlug, currentDate } from '@sync-in-server/backend/src/common/shared'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { BsDatepickerDirective, BsDatepickerInputDirective } from 'ngx-bootstrap/datepicker'
import { ClipboardService } from 'ngx-clipboard'
import { filter } from 'rxjs/operators'
import { AutofocusDirective } from '../../../../common/directives/auto-focus.directive'
import { CapitalizePipe } from '../../../../common/pipes/capitalize.pipe'
import { TimeDateFormatPipe } from '../../../../common/pipes/time-date-format.pipe'
import { LayoutService } from '../../../../layout/layout.service'
import { UserService } from '../../user.service'

@Component({
  selector: 'app-user-auth-manage-app-passwords',
  imports: [
    FaIconComponent,
    L10nTranslateDirective,
    TimeDateFormatPipe,
    AutofocusDirective,
    L10nTranslatePipe,
    BsDatepickerDirective,
    BsDatepickerInputDirective,
    ReactiveFormsModule,
    CapitalizePipe
  ],
  templateUrl: './user-auth-manage-app-passwords-dialog.component.html'
})
export class UserAuthManageAppPasswordsDialogComponent {
  @Input({ required: true }) appPasswords: Omit<UserAppPassword, 'password'>[] = []
  @Output() nbAppPasswords = new EventEmitter<number>()
  protected locale = inject<L10nLocale>(L10N_LOCALE)
  protected availableApps: AUTH_SCOPE[] = Object.values(AUTH_SCOPE)
  protected generatedPassword: UserAppPassword
  protected readonly minDate: Date = currentDate()
  protected hasError: string
  protected submitted = false
  protected readonly icons = { faKey, faCopy }
  private readonly fb = inject(UntypedFormBuilder)
  protected appPasswordForm: FormGroup = this.fb.group({
    name: this.fb.control('', [Validators.required]),
    app: this.fb.control(AUTH_SCOPE.WEBDAV, [Validators.required]),
    expiration: this.fb.control(null)
  })
  private readonly layout = inject(LayoutService)
  private readonly userService = inject(UserService)
  private readonly clipBoardService = inject(ClipboardService)

  constructor() {
    // set picker expiration to current date + 1 day
    this.minDate.setDate(this.minDate.getDate() + 1)
    this.appPasswordForm.controls.name.valueChanges.pipe(filter(Boolean)).subscribe((value: string) => {
      this.hasError = undefined
      this.appPasswordForm.controls.name.setValue(createLightSlug(value), { emitEvent: false })
    })
  }

  onClose() {
    this.layout.closeDialog()
  }

  deleteAppPassword(passwordName: string) {
    this.userService.deleteAppPassword(passwordName).subscribe({
      next: () => {
        this.appPasswords = this.appPasswords.filter((pwd) => pwd.name !== passwordName)
        this.nbAppPasswords.emit(this.appPasswords.length)
      },
      error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Application Passwords', 'Unable to revoke', e)
    })
  }

  async genAppPassword() {
    for (const appPwd of this.appPasswords) {
      if (appPwd.name === this.appPasswordForm.value.name) {
        this.hasError = 'This name is already used'
        return
      }
    }
    const auth2FaHeaders: false | HttpHeaders = await this.userService.auth2FaVerifyDialog()
    if (auth2FaHeaders === false) {
      return
    }
    this.userService.generateAppPassword(this.appPasswordForm.value, auth2FaHeaders).subscribe({
      next: (appPassword: UserAppPassword) => {
        this.appPasswordForm.patchValue({ name: '', expiration: null })
        this.appPasswords.unshift(appPassword)
        this.generatedPassword = appPassword
        this.nbAppPasswords.emit(this.appPasswords.length)
      },
      error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Application Passwords', 'Unable to generate', e)
    })
  }

  clipBoardPassword() {
    this.clipBoardService.copyFromContent(this.generatedPassword.password)
    this.layout.sendNotification('success', 'Generated password', 'Copied')
  }
}
