/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpErrorResponse } from '@angular/common/http'
import { Component, EventEmitter, inject, Input, Output } from '@angular/core'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faUserPlus } from '@fortawesome/free-solid-svg-icons'
import { GROUP_TYPE } from '@sync-in-server/backend/src/applications/users/constants/group'
import { USER_ROLE } from '@sync-in-server/backend/src/applications/users/constants/user'
import type { SearchMembersDto } from '@sync-in-server/backend/src/applications/users/dto/search-members.dto'
import { L10nTranslateDirective } from 'angular-l10n'
import { Observable } from 'rxjs'
import { LayoutService } from '../../../../layout/layout.service'
import { GroupBrowseModel } from '../../models/group-browse.model'
import { MemberModel } from '../../models/member.model'
import { UserService } from '../../user.service'
import { UserSearchComponent } from '../utils/user-search.component'

@Component({
  selector: 'app-user-group-add-users-dialog',
  imports: [FaIconComponent, L10nTranslateDirective, UserSearchComponent],
  templateUrl: 'user-group-add-users-dialog.component.html'
})
export class UserGroupAddUsersDialogComponent {
  @Input({ required: true }) parentGroup: GroupBrowseModel['parentGroup']
  @Input({ required: true }) currentMemberIds: number[] = []
  @Output() hasChanges = new EventEmitter<boolean>()
  protected readonly layout = inject(LayoutService)
  protected newMembers: MemberModel[] = []
  protected submitted = false
  protected readonly icons = { faUserPlus }
  private readonly userService = inject(UserService)

  searchMembers(query: string): Observable<MemberModel[]> {
    const search: SearchMembersDto = {
      search: query,
      onlyUsers: true,
      usersRole: this.parentGroup.type === GROUP_TYPE.USER ? USER_ROLE.USER : undefined,
      ignoreUserIds: [...this.currentMemberIds, ...this.newMembers.map((m) => m.id)]
    }
    return this.userService.searchMembers(search)
  }

  onSubmit() {
    this.submitted = true
    this.userService
      .addUsersToGroup(
        this.parentGroup.id,
        this.newMembers.map((m) => m.id)
      )
      .subscribe({
        next: () => {
          this.hasChanges.emit(true)
          this.layout.sendNotification('success', 'Add members', this.parentGroup.name)
          this.layout.closeDialog()
        },
        error: (e: HttpErrorResponse) => {
          this.submitted = false
          this.layout.sendNotification('error', 'Add members', this.parentGroup.name, e)
        }
      })
  }
}
