import { HttpErrorResponse } from '@angular/common/http'
import { Component, DestroyRef, inject, Input, OnInit, output, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { LucideDynamicIcon, LucideKeyRound, LucideUserRoundPen } from '@lucide/angular'
import { USER_GROUP_ROLE } from '@sync-in-server/backend/src/applications/users/constants/user'
import { L10nTranslateDirective } from 'angular-l10n'
import { LayoutService } from '../../../../layout/layout.service'
import { GroupBrowseModel } from '../../models/group-browse.model'
import { MemberModel } from '../../models/member.model'
import { UserService } from '../../user.service'

@Component({
  selector: 'app-user-personal-group-edit-user-dialog',
  imports: [LucideDynamicIcon, L10nTranslateDirective, FormsModule],
  templateUrl: 'user-personal-group-edit-user-dialog.component.html'
})
export class UserPersonalGroupEditUserDialogComponent implements OnInit {
  @Input({ required: true }) parentGroup: GroupBrowseModel['parentGroup']
  @Input({ required: true }) user: MemberModel
  readonly userChange = output<MemberModel>()
  protected readonly layout = inject(LayoutService)
  protected readonly submitted = signal(false)
  protected readonly isManager = signal(false)
  protected readonly USER_GROUP_ROLE = USER_GROUP_ROLE
  protected readonly icons = { LucideUserRoundPen, LucideKeyRound }
  private readonly destroyRef = inject(DestroyRef)
  private readonly userService = inject(UserService)

  ngOnInit() {
    this.isManager.set(this.user.isGroupManager)
  }

  onSubmit() {
    this.submitted.set(true)
    if (this.user.isGroupManager === this.isManager()) {
      this.layout.closeDialog()
      return
    }
    const role = this.isManager() ? USER_GROUP_ROLE.MANAGER : USER_GROUP_ROLE.MEMBER
    this.userService
      .updateUserFromPersonalGroup(this.parentGroup.id, this.user.id, { role: role })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.user.setGroupRole(role)
          this.userChange.emit(this.user)
          this.layout.sendNotification('success', 'Edit user', this.user.name)
          this.layout.closeDialog()
        },
        error: (e: HttpErrorResponse) => {
          this.submitted.set(false)
          this.layout.sendNotification('error', 'Edit user', this.user.name, e)
        }
      })
  }
}
