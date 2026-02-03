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
import { UserSearchComponent } from '../../../users/components/utils/user-search.component'
import type { GroupBrowseModel } from '../../../users/models/group-browse.model'
import { MemberModel } from '../../../users/models/member.model'
import { AdminService } from '../../admin.service'

@Component({
  selector: 'app-admin-group-add-users-dialog',
  imports: [FaIconComponent, L10nTranslateDirective, UserSearchComponent],
  templateUrl: 'admin-group-add-users-dialog.component.html'
})
export class AdminGroupAddUsersDialogComponent {
  @Input({ required: true }) parentGroup: GroupBrowseModel['parentGroup']
  @Input({ required: true }) currentMemberIds: number[] = []
  @Output() hasChanges = new EventEmitter<boolean>()
  protected readonly layout = inject(LayoutService)
  protected newMembers: MemberModel[] = []
  protected submitted = false
  protected readonly icons = { faUserPlus }
  private readonly adminService = inject(AdminService)

  searchMembers(query: string): Observable<MemberModel[]> {
    const search: SearchMembersDto = {
      search: query,
      onlyUsers: true,
      usersRole: this.parentGroup.type === GROUP_TYPE.USER ? USER_ROLE.USER : undefined,
      ignoreUserIds: [...this.currentMemberIds, ...this.newMembers.map((m) => m.id)]
    }
    return this.adminService.searchMembers(search)
  }

  onSubmit() {
    this.submitted = true
    this.adminService
      .addUsersToGroup(
        this.parentGroup.id,
        this.newMembers.map((m) => m.id)
      )
      .subscribe({
        next: () => {
          this.hasChanges.emit(true)
          this.layout.sendNotification('success', 'Add members', this.newMembers.map((m) => m.name).join('<br>'), null, { enableHtml: true })
          this.layout.closeDialog()
        },
        error: (e: HttpErrorResponse) => {
          this.submitted = false
          this.layout.sendNotification('error', 'Add members', this.newMembers.map((m) => m.name).join('<br>'), e, { enableHtml: true })
        }
      })
  }
}
