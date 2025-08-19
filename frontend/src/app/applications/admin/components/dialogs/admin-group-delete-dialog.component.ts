/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpErrorResponse } from '@angular/common/http'
import { Component, EventEmitter, inject, Input, Output } from '@angular/core'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faMinus, faUserMinus } from '@fortawesome/free-solid-svg-icons'
import { L10nTranslateDirective } from 'angular-l10n'
import { CapitalizePipe } from '../../../../common/pipes/capitalize.pipe'
import { LayoutService } from '../../../../layout/layout.service'
import type { GroupBrowseModel } from '../../../users/models/group-browse.model'
import { MemberModel } from '../../../users/models/member.model'
import { USER_ICON } from '../../../users/user.constants'
import { AdminService } from '../../admin.service'

@Component({
  selector: 'app-admin-group-delete-dialog',
  imports: [FaIconComponent, L10nTranslateDirective, CapitalizePipe],
  templateUrl: 'admin-group-delete-dialog.component.html'
})
export class AdminGroupDeleteDialogComponent {
  @Input({ required: true }) parentGroup: GroupBrowseModel['parentGroup']
  @Input({ required: true }) member: MemberModel
  @Output() wasDeleted = new EventEmitter<boolean>()
  protected submitted = false
  protected readonly icons = { GROUPS: USER_ICON.GROUPS, faMinus, faUserMinus }
  private readonly layout = inject(LayoutService)
  private readonly adminService = inject(AdminService)

  onSubmit() {
    this.submitted = true
    const notification = this.member.isUser ? 'Remove from group' : 'Delete group'
    const action = this.member.isUser
      ? this.adminService.removeUserFromGroup(this.parentGroup.id, this.member.id)
      : this.adminService.deleteGroup(this.member.id)
    action.subscribe({
      next: () => {
        this.wasDeleted.emit(true)
        this.layout.sendNotification('success', notification, this.member.name)
        this.onClose()
      },
      error: (e: HttpErrorResponse) => {
        this.submitted = false
        this.layout.sendNotification('error', notification, this.member.name, e)
      }
    })
  }

  onClose() {
    this.wasDeleted.emit(false)
    this.layout.closeDialog()
  }
}
