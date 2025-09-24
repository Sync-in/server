/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpErrorResponse } from '@angular/common/http'
import { Component, EventEmitter, inject, Input, Output } from '@angular/core'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faRightFromBracket } from '@fortawesome/free-solid-svg-icons'
import { L10nTranslateDirective } from 'angular-l10n'
import { LayoutService } from '../../../../layout/layout.service'
import { MemberModel } from '../../models/member.model'
import { USER_ICON } from '../../user.constants'

import { UserService } from '../../user.service'

@Component({
  selector: 'app-user-personal-group-leave-dialog',
  imports: [FaIconComponent, L10nTranslateDirective],
  templateUrl: 'user-personal-group-leave-dialog.component.html'
})
export class UserPersonalGroupLeaveDialogComponent {
  @Input({ required: true }) member: MemberModel
  @Output() wasLeft = new EventEmitter<boolean>()
  protected submitted = false
  protected readonly icons = { GROUPS: USER_ICON.GROUPS, faRightFromBracket }
  private readonly layout = inject(LayoutService)
  private readonly userService = inject(UserService)

  onClose() {
    this.wasLeft.emit(false)
    this.layout.closeDialog()
  }

  onSubmit() {
    this.submitted = true
    this.userService.leavePersonalGroup(this.member.id).subscribe({
      next: () => {
        this.wasLeft.emit(true)
        this.layout.sendNotification('success', 'The group was left', this.member.name)
        this.onClose()
      },
      error: (e: HttpErrorResponse) => {
        this.submitted = false
        this.layout.sendNotification('error', 'The group was not left', this.member.name, e)
      }
    })
  }
}
