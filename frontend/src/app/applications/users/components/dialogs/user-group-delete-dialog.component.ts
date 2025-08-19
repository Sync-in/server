/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpErrorResponse } from '@angular/common/http'
import { Component, EventEmitter, Input, Output, inject } from '@angular/core'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faMinus, faUserMinus } from '@fortawesome/free-solid-svg-icons'
import { L10nTranslateDirective } from 'angular-l10n'
import { CapitalizePipe } from '../../../../common/pipes/capitalize.pipe'
import { LayoutService } from '../../../../layout/layout.service'
import { GroupBrowseModel } from '../../models/group-browse.model'
import { MemberModel } from '../../models/member.model'
import { USER_ICON } from '../../user.constants'
import { UserService } from '../../user.service'

@Component({
  selector: 'app-user-group-delete-dialog',
  imports: [FaIconComponent, L10nTranslateDirective, CapitalizePipe],
  templateUrl: 'user-group-delete-dialog.component.html'
})
export class UserGroupDeleteDialogComponent {
  private readonly layout = inject(LayoutService)
  private readonly userService = inject(UserService)
  @Input({ required: true }) parentGroup: GroupBrowseModel['parentGroup']
  @Input({ required: true }) member: MemberModel
  @Output() wasDeleted = new EventEmitter<boolean>()
  protected submitted = false
  protected readonly icons = { GROUPS: USER_ICON.GROUPS, faMinus, faUserMinus }

  onSubmit() {
    this.submitted = true
    const notification = this.member.isUser ? 'Remove from group' : 'Delete group'
    const action = this.member.isUser
      ? this.userService.removeUserFromGroup(this.parentGroup.id, this.member.id)
      : this.userService.deletePersonalGroup(this.member.id)
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
