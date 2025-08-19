/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpErrorResponse } from '@angular/common/http'
import { Component, inject, Input, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faKey, faUserPen } from '@fortawesome/free-solid-svg-icons'
import { USER_GROUP_ROLE } from '@sync-in-server/backend/src/applications/users/constants/user'
import { L10nTranslateDirective } from 'angular-l10n'
import { LayoutService } from '../../../../layout/layout.service'
import { GroupBrowseModel } from '../../models/group-browse.model'
import { MemberModel } from '../../models/member.model'
import { UserService } from '../../user.service'

@Component({
  selector: 'app-user-personal-group-edit-user-dialog',
  imports: [FaIconComponent, L10nTranslateDirective, FormsModule],
  templateUrl: 'user-personal-group-edit-user-dialog.component.html'
})
export class UserPersonalGroupEditUserDialogComponent implements OnInit {
  @Input({ required: true }) parentGroup: GroupBrowseModel['parentGroup']
  @Input({ required: true }) user: MemberModel
  protected readonly layout = inject(LayoutService)
  protected submitted = false
  protected isManager = false
  protected readonly USER_GROUP_ROLE = USER_GROUP_ROLE
  protected readonly icons = { faUserPen, faKey }
  private readonly userService = inject(UserService)

  ngOnInit() {
    this.isManager = this.user.isGroupManager
  }

  onSubmit() {
    this.submitted = true
    if (this.user.isGroupManager === this.isManager) {
      this.layout.closeDialog()
      return
    }
    const role = this.isManager ? USER_GROUP_ROLE.MANAGER : USER_GROUP_ROLE.MEMBER
    this.userService.updateUserFromPersonalGroup(this.parentGroup.id, this.user.id, { role: role }).subscribe({
      next: () => {
        this.user.setGroupRole(role)
        this.layout.sendNotification('success', 'Edit user', this.user.name)
        this.layout.closeDialog()
      },
      error: (e: HttpErrorResponse) => {
        this.submitted = false
        this.layout.sendNotification('error', 'Edit user', this.user.name, e)
      }
    })
  }
}
