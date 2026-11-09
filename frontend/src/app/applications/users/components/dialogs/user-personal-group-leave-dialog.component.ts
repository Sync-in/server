import { HttpErrorResponse } from '@angular/common/http'
import { Component, EventEmitter, inject, Input, Output, signal } from '@angular/core'
import { LucideDynamicIcon, LucideLogOut } from '@lucide/angular'
import { L10nTranslateDirective } from 'angular-l10n'
import { LayoutService } from '../../../../layout/layout.service'
import { MemberModel } from '../../models/member.model'
import { USER_ICON } from '../../user.constants'

import { UserService } from '../../user.service'

@Component({
  selector: 'app-user-personal-group-leave-dialog',
  imports: [LucideDynamicIcon, L10nTranslateDirective],
  templateUrl: 'user-personal-group-leave-dialog.component.html'
})
export class UserPersonalGroupLeaveDialogComponent {
  @Input({ required: true }) member: MemberModel
  @Output() wasLeft = new EventEmitter<boolean>()
  protected readonly submitted = signal(false)
  protected readonly icons = { GROUPS: USER_ICON.GROUPS, LucideLogOut }
  private readonly layout = inject(LayoutService)
  private readonly userService = inject(UserService)

  onClose() {
    this.wasLeft.emit(false)
    this.layout.closeDialog()
  }

  onSubmit() {
    this.submitted.set(true)
    this.userService.leavePersonalGroup(this.member.id).subscribe({
      next: () => {
        this.wasLeft.emit(true)
        this.layout.sendNotification('success', 'The group was left', this.member.name)
        this.onClose()
      },
      error: (e: HttpErrorResponse) => {
        this.submitted.set(false)
        this.layout.sendNotification('error', 'The group was not left', this.member.name, e)
      }
    })
  }
}
