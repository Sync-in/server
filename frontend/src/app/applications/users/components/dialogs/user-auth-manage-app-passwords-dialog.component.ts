import { HttpErrorResponse, HttpHeaders } from '@angular/common/http'
import { Component, EventEmitter, inject, Input, OnInit, Output, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormGroup, ReactiveFormsModule, UntypedFormBuilder, Validators } from '@angular/forms'
import { LucideCopy, LucideDynamicIcon, LucideKeyRound } from '@lucide/angular'
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
    LucideDynamicIcon,
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
export class UserAuthManageAppPasswordsDialogComponent implements OnInit {
  @Input({ required: true }) appPasswords: Omit<UserAppPassword, 'password'>[] = []
  private readonly appPasswordsState = signal<Omit<UserAppPassword, 'password'>[]>([])
  @Output() nbAppPasswords = new EventEmitter<number>()
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly availableApps: AUTH_SCOPE[] = Object.values(AUTH_SCOPE)
  protected readonly passwords = this.appPasswordsState.asReadonly()
  protected readonly generatedPassword = signal<UserAppPassword | null>(null)
  protected readonly minDate: Date = currentDate()
  protected readonly hasError = signal<string | null>(null)
  protected readonly submitted = signal(false)
  protected readonly icons = { LucideKeyRound, LucideCopy }
  private readonly fb = inject(UntypedFormBuilder)
  protected readonly appPasswordForm: FormGroup = this.fb.group({
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
    this.appPasswordForm.controls.name.valueChanges.pipe(filter(Boolean), takeUntilDestroyed()).subscribe((value: string) => {
      this.hasError.set(null)
      this.appPasswordForm.controls.name.setValue(createLightSlug(value), { emitEvent: false })
    })
  }

  ngOnInit() {
    this.appPasswordsState.set(this.appPasswords)
  }

  onClose() {
    this.layout.closeDialog()
  }

  async deleteAppPassword(passwordName: string) {
    const auth2FaHeaders: false | HttpHeaders = await this.userService.auth2FaVerifyDialog(false, true)
    if (auth2FaHeaders === false) return
    this.userService.deleteAppPassword(passwordName, auth2FaHeaders).subscribe({
      next: () => {
        this.appPasswordsState.update((passwords) => passwords.filter((password) => password.name !== passwordName))
        this.nbAppPasswords.emit(this.appPasswordsState().length)
      },
      error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Application Passwords', 'Unable to revoke', e)
    })
  }

  async genAppPassword() {
    for (const appPwd of this.appPasswordsState()) {
      if (appPwd.name === this.appPasswordForm.value.name) {
        this.hasError.set('This name is already used')
        return
      }
    }
    const auth2FaHeaders: false | HttpHeaders = await this.userService.auth2FaVerifyDialog(false, true)
    if (auth2FaHeaders === false) return
    this.userService.generateAppPassword(this.appPasswordForm.value, auth2FaHeaders).subscribe({
      next: (appPassword: UserAppPassword) => {
        this.appPasswordForm.patchValue({ name: '', expiration: null })
        this.appPasswordsState().unshift(appPassword)
        this.appPasswordsState.set([...this.appPasswordsState()])
        this.generatedPassword.set(appPassword)
        this.nbAppPasswords.emit(this.appPasswordsState().length)
      },
      error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Application Passwords', 'Unable to generate', e)
    })
  }

  clipBoardPassword() {
    this.clipBoardService.copyFromContent(this.generatedPassword()!.password)
    this.layout.sendNotification('success', 'Generated password', 'Copied')
  }
}
