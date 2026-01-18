/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Component, EventEmitter, inject, Input, Output } from '@angular/core'
import { FormGroup, ReactiveFormsModule, UntypedFormBuilder, Validators } from '@angular/forms'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faCopy, faKey, faLock } from '@fortawesome/free-solid-svg-icons'
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
  imports: [FaIconComponent, L10nTranslateDirective, ReactiveFormsModule, InputPasswordComponent],
  templateUrl: 'user-auth-2fa-enable-dialog.component.html'
})
export class UserAuth2faEnableDialogComponent {
  @Input({ required: true }) qrDataUrl!: string
  @Input({ required: true }) secret!: string
  @Output() isValid = new EventEmitter<boolean>()
  protected wasEnabled = false
  protected submitted = false
  protected hasError: any = null
  protected recoveryCodes: string[]
  protected readonly icons = { faKey, faLock, faCopy }
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
    this.submitted = true
    this.userService.enable2Fa({ code: this.twoFaForm.value.totpCode, password: this.twoFaForm.value.password }).subscribe({
      next: (res: TwoFaEnableResult) => {
        if (res.success) {
          this.wasEnabled = true
          this.recoveryCodes = res.recoveryCodes
          this.isValid.emit(true)
        } else {
          this.hasError = 'Invalid code'
        }
        setTimeout(() => (this.submitted = false), 1000)
      },
      error: (e) => {
        this.hasError = e.error ? e.error.message : e
        setTimeout(() => (this.submitted = false), 1000)
      }
    })
  }

  clipBoardSecret() {
    this.clipBoardService.copyFromContent(this.secret)
    this.layout.sendNotification('info', 'Two-factor Authentication', 'Secret copied')
  }

  clipBoardRecoveryCodes() {
    this.clipBoardService.copyFromContent(this.recoveryCodes.join('\n'))
    this.layout.sendNotification('info', 'Two-factor Authentication', 'Recovery codes copied')
  }

  downloadRecoveryCodes() {
    const text = this.recoveryCodes.join('\n') // un code par ligne
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    // create a temporary link
    const url = URL.createObjectURL(blob)
    downloadWithAnchor(url, 'sync-in.recovery-codes.txt')
    // free the memory
    URL.revokeObjectURL(url)
  }
}
