import { KeyValuePipe } from '@angular/common'
import { HttpErrorResponse } from '@angular/common/http'
import { Component, ElementRef, inject, ViewChild } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, Data, Router, UrlSegment } from '@angular/router'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import {
  faArrowDown,
  faArrowRotateRight,
  faArrowUp,
  faKey,
  faMinus,
  faPen,
  faPlus,
  faRotate,
  faToggleOff,
  faToggleOn,
  faUserMinus,
  faUserPlus
} from '@fortawesome/free-solid-svg-icons'
import { ContextMenuComponent, ContextMenuModule } from '@perfectmemory/ngx-contextmenu'
import { GROUP_TYPE } from '@sync-in-server/backend/src/applications/users/constants/group'
import { MEMBER_TYPE } from '@sync-in-server/backend/src/applications/users/constants/member'
import { USER_GROUP_ROLE } from '@sync-in-server/backend/src/applications/users/constants/user'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { ButtonCheckboxDirective } from 'ngx-bootstrap/buttons'
import { BsDropdownDirective, BsDropdownMenuDirective, BsDropdownToggleDirective } from 'ngx-bootstrap/dropdown'
import { BsModalRef } from 'ngx-bootstrap/modal'
import { TooltipDirective } from 'ngx-bootstrap/tooltip'
import { filter, take } from 'rxjs/operators'
import { BadgeMembersComponent } from '../../../common/components/badge-members.component'
import { FilterComponent } from '../../../common/components/filter.component'
import { VirtualScrollComponent } from '../../../common/components/virtual-scroll.component'
import { TapDirective } from '../../../common/directives/tap.directive'
import { TableHeaderConfig } from '../../../common/interfaces/table.interface'
import { SearchFilterPipe } from '../../../common/pipes/search.pipe'
import { TimeDateFormatPipe } from '../../../common/pipes/time-date-format.pipe'
import { originalOrderKeyValue, pathFromRoutes } from '../../../common/utils/functions'
import { SortSettings, SortTable } from '../../../common/utils/sort-table'
import { LayoutService } from '../../../layout/layout.service'
import { UserGroupDialogComponent } from '../../users/components/dialogs/user-group-dialog.component'
import type { GroupBrowseModel } from '../../users/models/group-browse.model'
import { MemberModel } from '../../users/models/member.model'
import { USER_ICON } from '../../users/user.constants'
import { ADMIN_ICON, ADMIN_PATH, ADMIN_TITLE } from '../admin.constants'
import { AdminService } from '../admin.service'
import type { AdminGroupModel } from '../models/admin-group.model'
import { AdminGroupAddUsersDialogComponent } from './dialogs/admin-group-add-users-dialog.component'
import { AdminGroupDeleteDialogComponent } from './dialogs/admin-group-delete-dialog.component'
import { AdminGroupDialogComponent } from './dialogs/admin-group-dialog.component'
import { AdminGroupEditUserDialogComponent } from './dialogs/admin-group-edit-user-dialog.component'

@Component({
  selector: 'app-admin-groups',
  imports: [
    ContextMenuModule,
    FaIconComponent,
    KeyValuePipe,
    L10nTranslateDirective,
    L10nTranslatePipe,
    FilterComponent,
    SearchFilterPipe,
    VirtualScrollComponent,
    TooltipDirective,
    TimeDateFormatPipe,
    BsDropdownDirective,
    BsDropdownToggleDirective,
    BsDropdownMenuDirective,
    ButtonCheckboxDirective,
    FormsModule,
    TapDirective,
    BadgeMembersComponent
  ],
  templateUrl: 'admin-groups.component.html'
})
export class AdminGroupsComponent {
  @ViewChild(VirtualScrollComponent) scrollView: {
    element: ElementRef
    viewPortItems: MemberModel[]
    scrollInto: (arg: MemberModel | number) => void
  }
  @ViewChild(FilterComponent, { static: true }) inputFilter: FilterComponent
  @ViewChild('MainContextMenu', { static: true }) mainContextMenu: ContextMenuComponent<any>
  @ViewChild('TargetContextMenu', { static: true }) targetContextMenu: ContextMenuComponent<any>
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly originalOrderKeyValue = originalOrderKeyValue
  protected readonly icons = {
    GROUPS: USER_ICON.GROUPS,
    faRotate,
    faPlus,
    faMinus,
    faPen,
    faArrowDown,
    faArrowUp,
    faKey,
    faUserPlus,
    faUserMinus,
    faArrowRotateRight,
    faToggleOn,
    faToggleOff
  }
  // Sort
  protected tableHeaders: Record<'name' | 'type' | 'members' | 'createdAndModified', TableHeaderConfig> = {
    name: {
      label: 'Name',
      width: 30,
      textCenter: false,
      class: '',
      show: true,
      sortable: true
    },
    type: {
      label: 'Type',
      width: 10,
      textCenter: true,
      class: 'd-none d-md-table-cell',
      show: true,
      sortable: true
    },
    members: {
      label: 'Members',
      width: 10,
      class: 'd-none d-lg-table-cell',
      textCenter: true,
      show: true
    },
    createdAndModified: {
      label: 'Created & Modified',
      width: 12,
      textCenter: true,
      class: 'd-none d-lg-table-cell',
      newly: 'newly',
      show: true,
      sortable: true
    }
  }
  protected personalGroupsView = false
  protected loading = false
  protected currentGroup: GroupBrowseModel['parentGroup']
  protected selected: MemberModel = null
  protected members: MemberModel[] = []
  private readonly router = inject(Router)
  private readonly activatedRoute = inject(ActivatedRoute)
  private readonly layout = inject(LayoutService)
  private readonly adminService = inject(AdminService)
  private readonly sortSettings: SortSettings = {
    default: [{ prop: 'name', type: 'string' }],
    name: [{ prop: 'name', type: 'string' }],
    type: [{ prop: 'type', type: 'string' }],
    createdAndModified: [
      { prop: 'modifiedAt', type: 'date' },
      { prop: 'createdAt', type: 'date' }
    ]
  }
  protected sortTable = new SortTable(this.constructor.name, this.sortSettings)
  // States
  private focusOnSelect: string

  constructor() {
    this.activatedRoute.data.subscribe((route: Data) => {
      this.personalGroupsView = route.type === GROUP_TYPE.PERSONAL
      this.setEnv(route.routes as UrlSegment[])
    })
    this.activatedRoute.queryParams.subscribe((params) => (this.focusOnSelect = params.select))
    this.layout.setBreadcrumbIcon(ADMIN_ICON.GROUPS)
  }

  onPersonalGroupsView(state: boolean) {
    this.personalGroupsView = state
    this.router.navigate([ADMIN_PATH.BASE, state ? ADMIN_PATH.PGROUPS : ADMIN_PATH.GROUPS]).catch(console.error)
  }

  refresh() {
    this.loadGroups(this.currentGroup?.name)
  }

  browse(m: MemberModel) {
    if (m.isGroup) {
      this.router.navigate([m.name], { relativeTo: this.activatedRoute }).catch(console.error)
    }
  }

  onSelect(member: MemberModel = null) {
    this.selected = member
  }

  onContextMenu(ev: any) {
    ev.preventDefault()
    ev.stopPropagation()
    this.layout.openContextMenu(ev, this.mainContextMenu)
  }

  onTargetContextMenu(ev: any, member: MemberModel) {
    ev.preventDefault()
    if (ev.type === 'contextmenu') {
      ev.stopPropagation()
    }
    this.onSelect(member)
    this.layout.openContextMenu(ev, this.targetContextMenu)
  }

  sortBy(column: string, toUpdate = true, collection?: MemberModel[]) {
    this.members = this.sortTable.sortBy(column, toUpdate, collection || this.members)
  }

  addUserToGroupDialog() {
    const modalRef: BsModalRef<AdminGroupAddUsersDialogComponent> = this.layout.openDialog(AdminGroupAddUsersDialogComponent, 'md', {
      initialState: {
        parentGroup: this.currentGroup,
        currentMemberIds: this.members.filter((m) => m.isUser).map((u) => u.id)
      } as AdminGroupAddUsersDialogComponent
    })
    modalRef.content.hasChanges
      .pipe(
        filter((hasChanges: boolean) => hasChanges),
        take(1)
      )
      .subscribe(() => this.refresh())
  }

  openDialog(add = false, remove = false) {
    if (add) {
      if (this.personalGroupsView) {
        const modalRef: BsModalRef<UserGroupDialogComponent> = this.layout.openDialog(UserGroupDialogComponent, 'md')
        modalRef.content.groupChange.pipe(take(1)).subscribe((r: ['add' | string, MemberModel]) => {
          const [action, g] = r
          if (action === 'add') {
            g.setGroupRole(USER_GROUP_ROLE.MANAGER)
            g.counts = { users: 1 }
            this.sortBy(this.sortTable.sortParam.column, false, this.members.concat(g))
            this.onSelect(g)
          }
        })
      } else {
        const modalRef: BsModalRef<AdminGroupDialogComponent> = this.layout.openDialog(AdminGroupDialogComponent, 'md', {
          initialState: { parentGroup: this.currentGroup } as AdminGroupDialogComponent
        })
        modalRef.content.groupChange.pipe(take(1)).subscribe((r: ['add' | 'update', AdminGroupModel]) => {
          const [action, g] = r
          if (action === 'add') {
            if ((!this.currentGroup && !g?.parent) || g.parent.id === this.currentGroup.id) {
              const member = new MemberModel({ ...g, type: MEMBER_TYPE.GROUP })
              this.sortBy(this.sortTable.sortParam.column, false, this.members.concat(new MemberModel({ ...g, type: MEMBER_TYPE.GROUP })))
              this.onSelect(member)
            } else {
              this.router
                .navigate([`${ADMIN_PATH.BASE}/${ADMIN_PATH.GROUPS}`, g.parent?.id ? g.parent.name : ''], { queryParams: { select: g.name } })
                .catch(console.error)
            }
          }
        })
      }
    } else if (remove) {
      const modalRef: BsModalRef<AdminGroupDeleteDialogComponent> = this.layout.openDialog(AdminGroupDeleteDialogComponent, 'md', {
        initialState: { parentGroup: this.currentGroup, member: this.selected } as AdminGroupDeleteDialogComponent
      })
      modalRef.content.wasDeleted
        .pipe(
          filter((wasDeleted: boolean) => wasDeleted),
          take(1)
        )
        .subscribe(() => {
          if (!this.currentGroup) {
            this.loadGroups()
          } else if (this.selected.counts?.groups) {
            this.loadGroups(this.currentGroup.name)
          } else {
            this.sortBy(
              this.sortTable.sortParam.column,
              false,
              this.members.filter((member: MemberModel) => this.selected.mid !== member.mid)
            )
            this.onSelect()
          }
        })
    } else {
      // edit
      if (this.selected.isGroup) {
        if (this.personalGroupsView) {
          const modalRef: BsModalRef<UserGroupDialogComponent> = this.layout.openDialog(UserGroupDialogComponent, 'md', {
            initialState: { originalGroup: this.selected } as UserGroupDialogComponent
          })
          modalRef.content.groupChange.pipe(take(1)).subscribe((r: ['update' | string, MemberModel]) => {
            const [action, g] = r
            if (action === 'update') {
              this.selected = Object.assign(this.selected, {
                name: g.name,
                description: g.description,
                modifiedAt: g.modifiedAt
              })
            }
          })
        } else {
          this.adminService.getGroup(this.selected.id).subscribe({
            next: (group: AdminGroupModel) => {
              const modalRef: BsModalRef<AdminGroupDialogComponent> = this.layout.openDialog(AdminGroupDialogComponent, 'md', {
                initialState: { group: group, parentGroup: this.currentGroup } as AdminGroupDialogComponent
              })
              modalRef.content.groupChange.pipe(take(1)).subscribe((r: ['add' | 'update', AdminGroupModel]) => {
                const [action, g] = r
                if (action === 'update') {
                  if ((!this.currentGroup && !g?.parent) || g.parent.id === this.currentGroup.id) {
                    this.selected = Object.assign(this.selected, g)
                  } else {
                    this.router
                      .navigate([`${ADMIN_PATH.BASE}/${ADMIN_PATH.GROUPS}`, g.parent?.id ? g.parent.name : ''], { queryParams: { select: g.name } })
                      .catch(console.error)
                  }
                }
              })
            },
            error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Edit group', this.selected.name, e)
          })
        }
      } else {
        this.layout.openDialog(AdminGroupEditUserDialogComponent, 'md', {
          initialState: { user: this.selected, parentGroup: this.currentGroup } as AdminGroupEditUserDialogComponent
        })
      }
    }
  }

  private setEnv(routes: UrlSegment[]) {
    let currentGroupName: string
    if (!routes.length) {
      this.layout.setBreadcrumbNav({
        url: this.personalGroupsView
          ? `/${ADMIN_PATH.BASE}/${ADMIN_PATH.PGROUPS}/${ADMIN_TITLE.PGROUPS}`
          : `/${ADMIN_PATH.BASE}/${ADMIN_PATH.GROUPS}/${ADMIN_TITLE.GROUPS}`,
        splicing: 2,
        translating: true,
        sameLink: true
      })
    } else {
      currentGroupName = routes[routes.length - 1].path
      this.layout.setBreadcrumbNav({
        url: this.personalGroupsView
          ? `/${ADMIN_PATH.BASE}/${ADMIN_PATH.PGROUPS}${pathFromRoutes(routes)}`
          : `/${ADMIN_PATH.BASE}/${ADMIN_PATH.GROUPS}${pathFromRoutes(routes)}`,
        firstLink: `/${ADMIN_PATH.BASE}/${ADMIN_PATH.GROUPS}`,
        splicing: 1,
        translating: true,
        sameLink: false,
        mutateLevel: {
          0: {
            setTitle: this.personalGroupsView ? ADMIN_TITLE.PGROUPS : ADMIN_TITLE.GROUPS,
            translateTitle: true
          }
        }
      })
    }
    this.loadGroups(currentGroupName)
  }

  private loadGroups(currentGroupName?: string) {
    this.loading = true
    this.onSelect()
    this.adminService.browseGroup(currentGroupName, this.personalGroupsView).subscribe({
      next: (browse: GroupBrowseModel) => {
        this.currentGroup = browse.parentGroup
        this.sortBy(this.sortTable.sortParam.column, false, browse.members)
        if (this.focusOnSelect) {
          this.focusOn(this.focusOnSelect)
        } else {
          this.scrollView.scrollInto(-1)
        }
        this.loading = false
      },
      error: (e: HttpErrorResponse) => {
        this.members = []
        this.layout.sendNotification('error', 'Groups', e.error.message)
        this.onSelect()
        this.loading = false
      }
    })
  }

  private focusOn(select: string) {
    const s = this.members.find((m) => m.name === select)
    if (s) {
      setTimeout(() => this.scrollView.scrollInto(s), 100)
      this.onSelect(s)
    }
  }
}
