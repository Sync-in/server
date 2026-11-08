import { Component, EventEmitter, inject, Input, Output, signal } from '@angular/core'
import { FormGroup, ReactiveFormsModule, UntypedFormBuilder, Validators } from '@angular/forms'
import { LucideCopy, LucideDynamicIcon, LucideKeyRound, LucideLock } from '@lucide/angular'
import { TWO_FA_CODE_LENGTH } from '@sync-in-server/backend/src/authentication/constants/auth'
import type { TwoFaEnableResult } from '@sync-in-server/backend/src/authentication/providers/two-fa/auth-two-fa.interfaces'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective } from 'angular-l10n'
import { ClipboardService } from 'ngx-clipboard'
import { InputPasswordComponent } from '../../../../common/components/input-password.component'
import { downloadWithAnchor } from '../../../../common/utils/functions'
import { LayoutService } from '../../../../layout/layout.service'
import { UserService } from '../../user.service'

@Component({
  selector: 'app-user-auth-2fa-enable-dialog',
  imports: [LucideDynamicIcon, L10nTranslateDirective, ReactiveFormsModule, InputPasswordComponent],
  templateUrl: 'user-auth-2fa-enable-dialog.component.html'
})
export class UserAuth2faEnableDialogComponent {
  @Input({ required: true }) qrDataUrl!: string
  @Input({ required: true }) secret!: string
  @Output() isValid = new EventEmitter<boolean>()
  protected readonly wasEnabled = signal(false)
  protected readonly submitted = signal(false)
  protected readonly hasError = signal<any>(null)
  protected readonly recoveryCodes = signal<string[]>([])
  protected readonly icons = { LucideKeyRound, LucideLock, LucideCopy }
  protected readonly twoFaCodelength = TWO_FA_CODE_LENGTH
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  private readonly layout = inject(LayoutService)
  private readonly userService = inject(UserService)
  private readonly clipBoardService = inject(ClipboardService)
  private readonly fb = inject(UntypedFormBuilder)
  protected twoFaForm: FormGroup = this.fb.group({
    totpCode: this.fb.control('', [Validators.required, Validators.pattern(new RegExp(`^\\d{${TWO_FA_CODE_LENGTH}}$`))]),
    password: this.fb.control('')
  })

  onClose(state = false) {
    this.layout.closeDialog()
    this.isValid.emit(state)
  }

  onSubmit() {
    this.submitted.set(true)
    this.userService.enable2Fa({ code: this.twoFaForm.value.totpCode, password: this.twoFaForm.value.password }).subscribe({
      next: (res: TwoFaEnableResult) => {
        if (res.success) {
          this.wasEnabled.set(true)
          this.recoveryCodes.set(res.recoveryCodes)
          this.isValid.emit(true)
        } else {
          this.hasError.set('Invalid code')
        }
        setTimeout(() => this.submitted.set(false), 1000)
      },
      error: (e) => {
        this.hasError.set(e.error ? e.error.message : e)
        setTimeout(() => this.submitted.set(false), 1000)
      }
    })
  }

  clipBoardSecret() {
    this.clipBoardService.copyFromContent(this.secret)
    this.layout.sendNotification('success', 'Two-Factor Authentication', 'Secret copied')
  }

  clipBoardRecoveryCodes() {
    this.clipBoardService.copyFromContent(this.recoveryCodes().join('\n'))
    this.layout.sendNotification('success', 'Two-Factor Authentication', 'Recovery codes copied')
  }

  downloadRecoveryCodes() {
    const text = this.recoveryCodes().join('\n') // un code par ligne
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    // create a temporary link
    const url = URL.createObjectURL(blob)
    downloadWithAnchor(url, 'sync-in.recovery-codes.txt')
    // free the memory
    URL.revokeObjectURL(url)
  }
}
