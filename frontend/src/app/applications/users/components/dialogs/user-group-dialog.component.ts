import { HttpErrorResponse } from '@angular/common/http'
import { Component, EventEmitter, inject, Input, OnInit, Output } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faCog, faPen, faSpinner, faUsers } from '@fortawesome/free-solid-svg-icons'
import { MEMBER_TYPE } from '@sync-in-server/backend/src/applications/users/constants/member'
import type { UserCreateOrUpdateGroupDto } from '@sync-in-server/backend/src/applications/users/dto/create-or-update-group.dto'
import { L10nTranslateDirective } from 'angular-l10n'
import { AutofocusDirective } from '../../../../common/directives/auto-focus.directive'
import { LayoutService } from '../../../../layout/layout.service'
import { UserType } from '../../interfaces/user.interface'
import { MemberModel } from '../../models/member.model'
import { USER_ICON } from '../../user.constants'
import { UserService } from '../../user.service'

@Component({
  selector: 'app-user-group-dialog',
  imports: [ReactiveFormsModule, FormsModule, FaIconComponent, L10nTranslateDirective, AutofocusDirective],
  templateUrl: 'user-group-dialog.component.html'
})
export class UserGroupDialogComponent implements OnInit {
  @Input() originalGroup: MemberModel
  @Output() groupChange = new EventEmitter<['add' | 'update', MemberModel]>()
  protected readonly layout = inject(LayoutService)
  protected group: MemberModel
  protected readonly icons = { GROUPS: USER_ICON.GROUPS, faSpinner, faCog, faUsers, faPen }
  // states
  protected isPersonalGroup = true
  protected submitted = false
  protected loading = false
  private readonly userService = inject(UserService)
  protected readonly user: UserType = this.userService.user

  ngOnInit() {
    if (!this.originalGroup?.id) {
      this.group = new MemberModel({
        id: 0,
        name: '',
        description: '',
        createdAt: null,
        modifiedAt: null,
        type: MEMBER_TYPE.PGROUP
      })
    } else {
      this.isPersonalGroup = this.originalGroup.isPersonalGroup
      this.group = new MemberModel({
        id: this.originalGroup.id,
        name: this.originalGroup.name,
        description: this.originalGroup.description,
        createdAt: this.originalGroup.createdAt,
        modifiedAt: this.originalGroup.modifiedAt,
        type: this.originalGroup.type
      })
    }
  }

  onCancel() {
    this.layout.closeDialog()
  }

  onSubmit() {
    this.loading = true
    this.submitted = true
    if (this.group.id === 0) {
      // create
      this.userService.createPersonalGroup(this.makeDto(true)).subscribe({
        next: (g: MemberModel) => {
          this.loading = false
          this.groupChange.emit(['add', g])
          this.layout.sendNotification('success', 'Group created', g.name)
          this.layout.closeDialog()
        },
        error: (e: HttpErrorResponse) => this.onError(e)
      })
    } else {
      // update
      const updateDto = this.makeDto()
      if (!Object.keys(updateDto).length) {
        this.loading = false
        this.submitted = false
        return
      }
      this.userService.updatePersonalGroup(this.originalGroup.id, this.makeDto()).subscribe({
        next: (g: MemberModel) => {
          this.loading = false
          this.groupChange.emit(['update', g])
          this.layout.sendNotification('success', 'Group updated', g.name)
          this.layout.closeDialog()
        },
        error: (e: HttpErrorResponse) => this.onError(e)
      })
    }
  }

  private makeDto(create = false): UserCreateOrUpdateGroupDto {
    return {
      name: create ? this.group.name : this.group.name !== this.originalGroup.name ? this.group.name : undefined,
      description: create ? this.group.description : this.group.description !== this.originalGroup.description ? this.group.description : undefined
    }
  }

  private onError(e: HttpErrorResponse) {
    this.layout.sendNotification('error', 'Group error', this.group.name, e)
    this.submitted = false
    this.loading = false
  }
}
