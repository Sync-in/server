/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpErrorResponse } from '@angular/common/http'
import { Component, EventEmitter, inject, Input, Output } from '@angular/core'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faUserMinus } from '@fortawesome/free-solid-svg-icons'
import type { AdminDeleteUserDto } from '@sync-in-server/backend/src/applications/users/dto/delete-user.dto'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective } from 'angular-l10n'
import { InputPasswordComponent } from '../../../../common/components/input-password.component'
import { CapitalizePipe } from '../../../../common/pipes/capitalize.pipe'
import { LayoutService } from '../../../../layout/layout.service'
import { UserService } from '../../../users/user.service'
import { AdminService } from '../../admin.service'
import { AdminUserModel } from '../../models/admin-user.model'

@Component({
  selector: 'app-admin-user-delete-dialog',
  imports: [FaIconComponent, L10nTranslateDirective, ReactiveFormsModule, CapitalizePipe, InputPasswordComponent],
  templateUrl: 'admin-user-delete-dialog.component.html'
})
export class AdminUserDeleteDialogComponent {
  @Input({ required: true }) user: AdminUserModel
  @Output() wasDeleted = new EventEmitter<boolean>()
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected submitted = false
  protected readonly icons = { faUserMinus }
  protected deleteUserForm = new FormGroup<{
    adminPassword: FormControl<string>
    deleteSpace: FormControl<boolean>
  }>({ adminPassword: new FormControl('', Validators.required), deleteSpace: new FormControl(false) })
  private readonly layout = inject(LayoutService)
  private readonly adminService = inject(AdminService)
  private readonly userService = inject(UserService)

  onClose() {
    this.wasDeleted.emit(false)
    this.layout.closeDialog()
  }

  async onSubmit() {
    this.submitted = true
    const auth2Fa = await this.userService.auth2FaVerifyDialog()
    if (auth2Fa === false) {
      this.onClose()
      return
    }
    const totpCode = typeof auth2Fa === 'string' ? auth2Fa : undefined
    this.adminService
      .deleteUser(
        this.user.id,
        {
          adminPassword: this.deleteUserForm.value.adminPassword,
          deleteSpace: this.deleteUserForm.value.deleteSpace
        } satisfies AdminDeleteUserDto,
        false,
        totpCode
      )
      .subscribe({
        next: () => {
          this.wasDeleted.emit(true)
          this.layout.sendNotification('success', 'Delete user', this.user.login)
          this.onClose()
        },
        error: (e: HttpErrorResponse) => {
          this.submitted = false
          this.layout.sendNotification('error', 'Delete user', this.user.login, e)
        }
      })
  }
}
