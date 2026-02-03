import { KeyValuePipe } from '@angular/common'
import { HttpErrorResponse } from '@angular/common/http'
import { Component, EventEmitter, inject, Input, OnInit, Output } from '@angular/core'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faCog, faPen, faPlus, faShieldHalved } from '@fortawesome/free-solid-svg-icons'
import { GROUP_VISIBILITY } from '@sync-in-server/backend/src/applications/users/constants/group'
import { USER_PERMISSION, USER_PERMS_SEP } from '@sync-in-server/backend/src/applications/users/constants/user'
import type { CreateOrUpdateGroupDto } from '@sync-in-server/backend/src/applications/users/dto/create-or-update-group.dto'
import type { SearchMembersDto } from '@sync-in-server/backend/src/applications/users/dto/search-members.dto'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { TabDirective, TabHeadingDirective, TabsetComponent } from 'ngx-bootstrap/tabs'
import { Observable } from 'rxjs'
import { SelectComponent } from '../../../../common/components/select/select.component'
import { AutofocusDirective } from '../../../../common/directives/auto-focus.directive'
import { TimeDateFormatPipe } from '../../../../common/pipes/time-date-format.pipe'
import { originalOrderKeyValue } from '../../../../common/utils/functions'
import { LayoutService } from '../../../../layout/layout.service'
import { USER_ICON } from '../../../users/user.constants'
import { AdminService } from '../../admin.service'
import { AdminGroupModel } from '../../models/admin-group.model'
import { AdminPermissionsComponent } from '../utils/admin-permissions.component'

@Component({
  selector: 'app-admin-group-dialog',
  imports: [
    FaIconComponent,
    L10nTranslateDirective,
    ReactiveFormsModule,
    AutofocusDirective,
    AdminPermissionsComponent,
    KeyValuePipe,
    SelectComponent,
    L10nTranslatePipe,
    TimeDateFormatPipe,
    TabDirective,
    TabHeadingDirective,
    TabsetComponent
  ],
  templateUrl: 'admin-group-dialog.component.html'
})
export class AdminGroupDialogComponent implements OnInit {
  @Input() group: AdminGroupModel = null
  @Input() parentGroup: Pick<AdminGroupModel, 'id' | 'name' | 'type'> = null
  @Output() groupChange = new EventEmitter<['add' | 'update', AdminGroupModel]>()
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly layout = inject(LayoutService)
  protected readonly icons = { GROUPS: USER_ICON.GROUPS, faPen, faPlus, faCog, faShieldHalved }
  protected tabView: undefined | 'permissions'
  protected submitted = false
  protected readonly originalOrderKeyValue = originalOrderKeyValue
  protected readonly allVisibilities = {
    Visible: GROUP_VISIBILITY.VISIBLE,
    Private: GROUP_VISIBILITY.PRIVATE,
    Isolated: GROUP_VISIBILITY.ISOLATED
  }
  protected groupForm: FormGroup<{
    name: FormControl<string>
    description: FormControl<string>
    visibility: FormControl<GROUP_VISIBILITY>
    applications: FormControl<USER_PERMISSION[]>
    parent: FormControl<AdminGroupModel['parent']>
  }>
  private readonly adminService = inject(AdminService)

  ngOnInit() {
    this.groupForm = new FormGroup({
      name: new FormControl<string>(this.group?.name || '', Validators.required),
      description: new FormControl<string>(this.group?.description || ''),
      visibility: new FormControl<GROUP_VISIBILITY>(this.group?.visibility || GROUP_VISIBILITY.VISIBLE),
      applications: new FormControl<USER_PERMISSION[]>(this.group?.applications || []),
      parent: new FormControl<AdminGroupModel['parent']>(this.parentGroup)
    })
  }

  updateApplications(apps: USER_PERMISSION[]) {
    this.groupForm.controls.applications.setValue(apps)
    this.groupForm.controls.applications.markAsDirty()
  }

  onSetParent(item: AdminGroupModel['parent']) {
    this.groupForm.controls.parent.setValue(item ? { id: item.id, name: item.name } : null)
    this.groupForm.controls.parent.markAsDirty()
  }

  searchGroups(query: string): Observable<AdminGroupModel['parent'][]> {
    const search: SearchMembersDto = {
      search: query,
      onlyGroups: true,
      excludePersonalGroups: true,
      ignoreGroupIds: this.groupForm.value.parent ? [this.groupForm.value.parent.id] : []
    }
    return this.adminService.searchMembers(search, true)
  }

  onSubmit() {
    this.submitted = true
    if (this.group?.id) {
      // update
      const dto: CreateOrUpdateGroupDto = this.makeDto()
      this.adminService.updateGroup(this.group.id, dto).subscribe({
        next: (g: AdminGroupModel) => {
          this.groupChange.emit(['update', g])
          this.layout.sendNotification('success', 'Group updated', this.groupForm.value.name)
          this.layout.closeDialog()
        },
        error: (e: HttpErrorResponse) => this.onError(e)
      })
    } else {
      // create
      const dto: CreateOrUpdateGroupDto = this.makeDto(true)
      this.adminService.createGroup(dto).subscribe({
        next: (g: AdminGroupModel) => {
          this.groupChange.emit(['add', g])
          this.layout.sendNotification('success', 'Group created', this.groupForm.value.name)
          this.layout.closeDialog()
        },
        error: (e: HttpErrorResponse) => this.onError(e)
      })
    }
  }

  private makeDto(create = false): CreateOrUpdateGroupDto {
    let dto: Partial<CreateOrUpdateGroupDto>
    if (create) {
      dto = Object.fromEntries(Object.keys(this.groupForm.controls).map((k: string) => [k, this.groupForm.controls[k].value]))
    } else {
      dto = Object.fromEntries(
        Object.keys(this.groupForm.controls)
          .filter((k: string) => this.groupForm.controls[k].dirty)
          .map((k: string) => [k, this.groupForm.controls[k].value])
      )
    }
    for (const k in dto) {
      switch (k) {
        case 'applications':
          dto.permissions = dto[k].join(USER_PERMS_SEP)
          delete dto['applications']
          break
        case 'parent':
          dto.parentId = dto[k] ? dto[k]['id'] : null
          delete dto['parent']
          break
      }
    }
    return dto as CreateOrUpdateGroupDto
  }

  private onError(e: HttpErrorResponse) {
    this.layout.sendNotification('error', 'Group error', this.groupForm.value.name, e)
    this.submitted = false
  }
}
