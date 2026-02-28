import { KeyValuePipe } from '@angular/common'
import { HttpErrorResponse } from '@angular/common/http'
import { Component, ElementRef, inject, ViewChild } from '@angular/core'
import { ActivatedRoute, Data, Router, UrlSegment } from '@angular/router'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import {
  faArrowDown,
  faArrowRotateRight,
  faArrowUp,
  faEllipsis,
  faKey,
  faMinus,
  faPen,
  faPlus,
  faRightFromBracket,
  faRotate,
  faUsersRectangle
} from '@fortawesome/free-solid-svg-icons'
import { ContextMenuComponent, ContextMenuModule } from '@perfectmemory/ngx-contextmenu'
import { GROUP_TYPE } from '@sync-in-server/backend/src/applications/users/constants/group'
import { USER_GROUP_ROLE, USER_PERMISSION } from '@sync-in-server/backend/src/applications/users/constants/user'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { BsDropdownDirective, BsDropdownMenuDirective, BsDropdownToggleDirective } from 'ngx-bootstrap/dropdown'
import { BsModalRef } from 'ngx-bootstrap/modal'
import { TooltipDirective } from 'ngx-bootstrap/tooltip'
import { filter, take } from 'rxjs/operators'
import { FilterComponent } from '../../../common/components/filter.component'
import { VirtualScrollComponent } from '../../../common/components/virtual-scroll.component'
import { TapDirective } from '../../../common/directives/tap.directive'
import { TableHeaderConfig } from '../../../common/interfaces/table.interface'
import { JoinCountsPipe } from '../../../common/pipes/join-counts.pipe'
import { SearchFilterPipe } from '../../../common/pipes/search.pipe'
import { TimeAgoPipe } from '../../../common/pipes/time-ago.pipe'
import { originalOrderKeyValue, pathFromRoutes } from '../../../common/utils/functions'
import { SortSettings, SortTable } from '../../../common/utils/sort-table'
import { LayoutService } from '../../../layout/layout.service'
import { GroupBrowseModel } from '../models/group-browse.model'
import { MemberModel } from '../models/member.model'
import { USER_ICON, USER_PATH, USER_TITLE } from '../user.constants'
import { UserService } from '../user.service'
import { UserGroupAddUsersDialogComponent } from './dialogs/user-group-add-users-dialog.component'
import { UserGroupDeleteDialogComponent } from './dialogs/user-group-delete-dialog.component'
import { UserGroupDialogComponent } from './dialogs/user-group-dialog.component'
import { UserPersonalGroupEditUserDialogComponent } from './dialogs/user-personal-group-edit-user-dialog.component'
import { UserPersonalGroupLeaveDialogComponent } from './dialogs/user-personal-group-leave-dialog.component'

@Component({
  selector: 'app-user-groups',
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
    JoinCountsPipe,
    TimeAgoPipe,
    BsDropdownDirective,
    BsDropdownToggleDirective,
    BsDropdownMenuDirective,
    TapDirective
  ],
  templateUrl: 'user-groups.component.html'
})
export class UserGroupsComponent {
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
    faArrowRotateRight,
    faRightFromBracket,
    faUsersRectangle,
    faEllipsis
  }
  // Sort
  protected tableHeaders: Record<'name' | 'type' | 'role' | 'members' | 'createdAt' | 'modifiedAt' | 'memberSince', TableHeaderConfig> = {
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
      class: '',
      show: true,
      sortable: true
    },
    role: {
      label: 'Role',
      width: 10,
      textCenter: true,
      class: 'd-none d-lg-table-cell',
      show: false,
      sortable: true
    },
    members: {
      label: 'Members',
      width: 10,
      class: '',
      textCenter: true,
      show: true
    },
    memberSince: {
      label: 'Member since',
      width: 12,
      textCenter: true,
      class: 'd-none d-lg-table-cell',
      show: false,
      sortable: true
    },
    createdAt: {
      label: 'Created',
      width: 12,
      textCenter: true,
      class: 'd-none d-lg-table-cell',
      show: true,
      sortable: true
    },
    modifiedAt: {
      label: 'Modified',
      width: 12,
      textCenter: true,
      class: 'd-none d-lg-table-cell',
      newly: 'newly',
      show: true,
      sortable: true
    }
  }
  // States
  protected currentGroup: GroupBrowseModel['parentGroup']
  protected isCurrentGroupManager = false
  protected allowedAction = {
    addGroup: false,
    addUsers: false,
    removeUser: false,
    removeGroup: false,
    editUser: false,
    editGroup: false,
    leaveGroup: false
  }
  protected loading = false
  protected selected: MemberModel = null
  protected members: MemberModel[] = []
  private readonly router = inject(Router)
  private readonly activatedRoute = inject(ActivatedRoute)
  private readonly layout = inject(LayoutService)
  private readonly userService = inject(UserService)
  protected canCreatePersonalGroup = this.userService.userHavePermission(USER_PERMISSION.PERSONAL_GROUPS_ADMIN)
  private readonly sortSettings: SortSettings = {
    default: [{ prop: 'name', type: 'string' }],
    name: [{ prop: 'name', type: 'string' }],
    type: [{ prop: 'type', type: 'string' }],
    role: [{ prop: 'isGroupManager', type: 'number' }],
    createdAt: [{ prop: 'createdAt', type: 'date' }],
    modifiedAt: [{ prop: 'modifiedAt', type: 'date' }]
  }
  protected sortTable = new SortTable(this.constructor.name, this.sortSettings)
  private focusOnSelect: string

  constructor() {
    this.activatedRoute.data.subscribe((route: Data) => this.setEnv(route.routes as UrlSegment[]))
    this.activatedRoute.queryParams.subscribe((params) => (this.focusOnSelect = params.select))
    this.layout.setBreadcrumbIcon(USER_ICON.GROUPS)
  }

  setEnv(routes: UrlSegment[]) {
    let currentGroupName: string
    if (!routes.length) {
      this.layout.setBreadcrumbNav({
        url: `/${USER_PATH.BASE}/${USER_PATH.GROUPS}/${USER_TITLE.GROUPS}`,
        splicing: 2,
        translating: true,
        sameLink: true
      })
    } else {
      currentGroupName = routes[routes.length - 1].path
      this.layout.setBreadcrumbNav({
        url: `/${USER_PATH.BASE}/${USER_PATH.GROUPS}/${USER_TITLE.GROUPS}${pathFromRoutes(routes)}`,
        splicing: 2,
        translating: true,
        sameLink: true,
        mutateLevel: {
          1: {
            setUrl: true
          }
        }
      })
    }
    this.loadGroups(currentGroupName)
  }

  refresh() {
    this.loadGroups(this.currentGroup?.name)
  }

  loadGroups(currentGroupName?: string) {
    this.loading = true
    this.onSelect()
    this.userService.browseGroup(currentGroupName).subscribe({
      next: (browse: GroupBrowseModel) => {
        this.tableHeaders.members.show = !currentGroupName
        this.tableHeaders.role.show = !currentGroupName
        this.tableHeaders.modifiedAt.show = !currentGroupName
        this.tableHeaders.createdAt.show = !currentGroupName
        this.tableHeaders.memberSince.show = !!currentGroupName
        this.currentGroup = browse.parentGroup
        this.isCurrentGroupManager = this.currentGroup?.role === USER_GROUP_ROLE.MANAGER
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

  browse(m: MemberModel) {
    if (m.isGroup) {
      this.router.navigate([m.name], { relativeTo: this.activatedRoute }).catch(console.error)
    }
  }

  onSelect(member: MemberModel = null) {
    this.selected = member
    if (!this.selected) {
      this.allowedAction = {
        addGroup: !this.currentGroup && this.canCreatePersonalGroup,
        addUsers: !!this.currentGroup && this.isCurrentGroupManager,
        removeUser: false,
        removeGroup: false,
        editUser: false,
        editGroup: false,
        leaveGroup: false
      }
    } else {
      this.allowedAction = {
        addGroup: !this.currentGroup && this.canCreatePersonalGroup,
        addUsers: !!this.currentGroup && this.isCurrentGroupManager,
        removeUser: !!this.currentGroup && this.selected.isUser && this.isCurrentGroupManager,
        removeGroup: !this.currentGroup && this.selected.isGroup && this.selected.isGroupManager && this.selected.isPersonalGroup,
        editUser: !!this.currentGroup && this.selected.isUser && this.isCurrentGroupManager && this.currentGroup.type === GROUP_TYPE.PERSONAL,
        editGroup: !this.currentGroup && this.selected.isGroup && this.selected.isGroupManager && this.selected.isPersonalGroup,
        leaveGroup: !this.currentGroup && this.selected.isGroup && this.selected.isPersonalGroup
      }
    }
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

  openDialog(add = false, remove = false) {
    if (add) {
      if (!this.currentGroup) {
        // add group
        const modalRef: BsModalRef<UserGroupDialogComponent> = this.layout.openDialog(UserGroupDialogComponent, 'sm')
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
        // add users
        const modalRef: BsModalRef<UserGroupAddUsersDialogComponent> = this.layout.openDialog(UserGroupAddUsersDialogComponent, 'md', {
          initialState: {
            parentGroup: this.currentGroup,
            currentMemberIds: this.members.filter((m) => m.isUser).map((u) => u.id)
          } as UserGroupAddUsersDialogComponent
        })
        modalRef.content.hasChanges
          .pipe(
            filter((hasChanges: boolean) => hasChanges),
            take(1)
          )
          .subscribe(() => this.refresh())
      }
    } else if (remove) {
      // remove group or user
      const modalRef: BsModalRef<UserGroupDeleteDialogComponent> = this.layout.openDialog(UserGroupDeleteDialogComponent, 'md', {
        initialState: { parentGroup: this.currentGroup, member: this.selected } as UserGroupDeleteDialogComponent
      })
      modalRef.content.wasDeleted
        .pipe(
          filter((wasDeleted: boolean) => wasDeleted),
          take(1)
        )
        .subscribe(() => {
          this.sortBy(
            this.sortTable.sortParam.column,
            false,
            this.members.filter((member: MemberModel) => this.selected.mid !== member.mid)
          )
          this.onSelect()
        })
    } else {
      // edit group or user
      if (this.selected.isGroup) {
        const modalRef: BsModalRef<UserGroupDialogComponent> = this.layout.openDialog(UserGroupDialogComponent, 'sm', {
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
        this.layout.openDialog(UserPersonalGroupEditUserDialogComponent, 'md', {
          initialState: { parentGroup: this.currentGroup, user: this.selected } as UserPersonalGroupEditUserDialogComponent
        })
      }
    }
  }

  openLeaveGroupDialog() {
    const modalRef: BsModalRef<UserPersonalGroupLeaveDialogComponent> = this.layout.openDialog(UserPersonalGroupLeaveDialogComponent, 'md', {
      initialState: { member: this.selected } as UserPersonalGroupLeaveDialogComponent
    })
    modalRef.content.wasLeft.pipe(take(1)).subscribe((wasLeft: boolean) => {
      if (!wasLeft) {
        return
      }
      this.sortBy(
        this.sortTable.sortParam.column,
        false,
        this.members.filter((m: MemberModel) => m.id !== this.selected.id)
      )
      this.onSelect()
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
