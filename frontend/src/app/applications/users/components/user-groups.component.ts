import { KeyValuePipe, NgTemplateOutlet } from '@angular/common'
import { HttpErrorResponse } from '@angular/common/http'
import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core'
import { ActivatedRoute, Data, Router, UrlSegment } from '@angular/router'
import {
  LucideArrowDown,
  LucideArrowUp,
  LucideDynamicIcon,
  LucideEllipsis,
  LucideKeyRound,
  LucideLogOut,
  LucidePencil,
  LucidePlus,
  LucideRotateCw,
  LucideTrash,
  LucideUserMinus,
  LucideUsersRound
} from '@lucide/angular'
import { ContextMenuComponent, ContextMenuModule } from '@perfectmemory/ngx-contextmenu'
import { GROUP_TYPE } from '@sync-in-server/backend/src/applications/users/constants/group'
import { USER_GROUP_ROLE, USER_PERMISSION } from '@sync-in-server/backend/src/applications/users/constants/user'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { BsDropdownDirective, BsDropdownMenuDirective, BsDropdownToggleDirective } from 'ngx-bootstrap/dropdown'
import { BsModalRef } from 'ngx-bootstrap/modal'
import { TooltipDirective } from 'ngx-bootstrap/tooltip'
import { filter, take } from 'rxjs/operators'
import { BadgeMembersComponent } from '../../../common/components/badge-members.component'
import { VirtualScrollComponent } from '../../../common/components/virtual-scroll.component'
import { TapDirective } from '../../../common/directives/tap.directive'
import { TableHeaderConfig } from '../../../common/interfaces/table.interface'
import { SearchFilterPipe } from '../../../common/pipes/search.pipe'
import { TimeAgoPipe } from '../../../common/pipes/time-ago.pipe'
import { originalOrderKeyValue, pathFromRoutes } from '../../../common/utils/functions'
import { SortSettings, SortTable } from '../../../common/utils/sort-table'
import { LayoutService } from '../../../layout/layout.service'
import { NavbarSearchService } from '../../../layout/navbar/services/navbar-search.service'
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
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ContextMenuModule,
    LucideDynamicIcon,
    KeyValuePipe,
    L10nTranslateDirective,
    L10nTranslatePipe,
    SearchFilterPipe,
    VirtualScrollComponent,
    TooltipDirective,
    TimeAgoPipe,
    BsDropdownDirective,
    BsDropdownToggleDirective,
    BsDropdownMenuDirective,
    TapDirective,
    BadgeMembersComponent,
    NgTemplateOutlet
  ],
  templateUrl: 'user-groups.component.html'
})
export class UserGroupsComponent {
  readonly scrollView = viewChild.required<VirtualScrollComponent<MemberModel>>(VirtualScrollComponent)
  readonly mainContextMenu = viewChild.required<ContextMenuComponent<any>>('MainContextMenu')
  readonly targetContextMenu = viewChild.required<ContextMenuComponent<any>>('TargetContextMenu')
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly navbarSearch = inject(NavbarSearchService)
  protected readonly originalOrderKeyValue = originalOrderKeyValue
  protected readonly icons = {
    GROUPS: USER_ICON.GROUPS,
    LucideRotateCw,
    LucidePlus,
    LucideTrash,
    LucideUserMinus,
    LucidePencil,
    LucideArrowDown,
    LucideArrowUp,
    LucideKeyRound,
    LucideLogOut,
    LucideUsersRound,
    LucideEllipsis
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
      class: 'd-none d-md-table-cell',
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
      class: 'd-none d-md-table-cell',
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
  protected readonly currentGroup = signal<GroupBrowseModel['parentGroup']>(undefined)
  protected readonly loading = signal(false)
  protected readonly selected = signal<MemberModel | null>(null)
  protected readonly members = signal<MemberModel[]>([])
  protected readonly isCurrentGroupManager = computed(() => this.currentGroup()?.role === USER_GROUP_ROLE.MANAGER)
  protected readonly allowedAction = computed(() => {
    const currentGroup = this.currentGroup()
    const selected = this.selected()
    const isCurrentGroupManager = this.isCurrentGroupManager()
    const isRootRoute = !currentGroup
    return {
      addGroup: isRootRoute && this.canCreatePersonalGroup,
      addUsers: !!currentGroup && isCurrentGroupManager,
      removeUser: !!currentGroup && !!selected?.isUser && isCurrentGroupManager,
      removeGroup: isRootRoute && !!selected?.isGroup && !!selected?.isGroupManager && !!selected?.isPersonalGroup,
      editUser: !!currentGroup && !!selected?.isUser && isCurrentGroupManager && currentGroup.type === GROUP_TYPE.PERSONAL,
      editGroup: isRootRoute && !!selected?.isGroup && !!selected?.isGroupManager && !!selected?.isPersonalGroup,
      leaveGroup: isRootRoute && !!selected?.isGroup && !!selected?.isPersonalGroup
    }
  })
  private readonly router = inject(Router)
  private readonly activatedRoute = inject(ActivatedRoute)
  private readonly layout = inject(LayoutService)
  private readonly userService = inject(UserService)
  protected readonly canCreatePersonalGroup = this.userService.userHavePermission(USER_PERMISSION.PERSONAL_GROUPS_ADMIN)
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
    this.activatedRoute.data.subscribe((route: Data) => {
      this.setEnv(route.routes as UrlSegment[])
    })
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
    this.loadGroups(this.currentGroup()?.name)
  }

  loadGroups(currentGroupName?: string) {
    this.loading.set(true)
    this.onSelect()
    this.userService.browseGroup(currentGroupName).subscribe({
      next: (browse: GroupBrowseModel) => {
        this.tableHeaders.members.show = !currentGroupName
        this.tableHeaders.role.show = !currentGroupName
        this.tableHeaders.modifiedAt.show = !currentGroupName
        this.tableHeaders.createdAt.show = !currentGroupName
        this.tableHeaders.memberSince.show = !!currentGroupName
        this.currentGroup.set(browse.parentGroup)
        this.sortBy(this.sortTable.sortParam.column, false, browse.members)
        if (this.focusOnSelect) {
          this.focusOn(this.focusOnSelect)
        } else {
          this.onSelect()
          this.scrollView().scrollInto(-1)
        }
        this.loading.set(false)
      },
      error: (e: HttpErrorResponse) => {
        this.members.set([])
        this.layout.sendNotification('error', 'Groups', e.error.message)
        this.onSelect()
        this.loading.set(false)
      }
    })
  }

  browse(m: MemberModel) {
    if (m.isGroup) {
      this.router.navigate([m.name], { relativeTo: this.activatedRoute }).catch(console.error)
    }
  }

  onMemberActivate(member: MemberModel) {
    this.onSelect(member)
    this.browse(member)
  }

  onSelect(member: MemberModel = null) {
    this.selected.set(member)
  }

  onContextMenu(ev: any) {
    ev.preventDefault()
    ev.stopPropagation()
    this.layout.openContextMenu(ev, this.mainContextMenu())
  }

  onTargetContextMenu(ev: any, member: MemberModel) {
    ev.preventDefault()
    if (ev.type === 'contextmenu') {
      ev.stopPropagation()
    }
    this.onSelect(member)
    this.layout.openContextMenu(ev, this.targetContextMenu())
  }

  sortBy(column: string, toUpdate = true, collection?: MemberModel[]) {
    this.members.set(this.sortTable.sortBy(column, toUpdate, collection || this.members()))
  }

  openDialog(add = false, remove = false) {
    if (add) {
      if (!this.currentGroup()) {
        // add group
        const modalRef: BsModalRef<UserGroupDialogComponent> = this.layout.openDialog(UserGroupDialogComponent, 'sm')
        modalRef.content.groupChange.pipe(take(1)).subscribe((r: ['add' | string, MemberModel]) => {
          const [action, g] = r
          if (action === 'add') {
            g.setGroupRole(USER_GROUP_ROLE.MANAGER)
            g.counts = { users: 1 }
            this.sortBy(this.sortTable.sortParam.column, false, this.members().concat(g))
            this.onSelect(g)
          }
        })
      } else {
        // add users
        const modalRef: BsModalRef<UserGroupAddUsersDialogComponent> = this.layout.openDialog(UserGroupAddUsersDialogComponent, 'md', {
          initialState: {
            parentGroup: this.currentGroup(),
            currentMemberIds: this.members()
              .filter((m) => m.isUser)
              .map((u) => u.id)
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
        initialState: { parentGroup: this.currentGroup(), member: this.selected() } as UserGroupDeleteDialogComponent
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
            this.members().filter((member: MemberModel) => this.selected().mid !== member.mid)
          )
          this.onSelect()
        })
    } else {
      // edit group or user
      if (this.selected().isGroup) {
        const modalRef: BsModalRef<UserGroupDialogComponent> = this.layout.openDialog(UserGroupDialogComponent, 'sm', {
          initialState: { originalGroup: this.selected() } as UserGroupDialogComponent
        })
        modalRef.content.groupChange.pipe(take(1)).subscribe((r: ['update' | string, MemberModel]) => {
          const [action, g] = r
          if (action === 'update') {
            Object.assign(this.selected(), {
              name: g.name,
              description: g.description,
              modifiedAt: g.modifiedAt
            })
            this.members.update((members) => [...members])
          }
        })
      } else {
        const modalRef: BsModalRef<UserPersonalGroupEditUserDialogComponent> = this.layout.openDialog(
          UserPersonalGroupEditUserDialogComponent,
          'md',
          { initialState: { parentGroup: this.currentGroup(), user: this.selected() } as UserPersonalGroupEditUserDialogComponent }
        )
        modalRef.content.userChange.subscribe(() => this.members.update((members) => [...members]))
      }
    }
  }

  openLeaveGroupDialog() {
    const modalRef: BsModalRef<UserPersonalGroupLeaveDialogComponent> = this.layout.openDialog(UserPersonalGroupLeaveDialogComponent, 'md', {
      initialState: { member: this.selected() } as UserPersonalGroupLeaveDialogComponent
    })
    modalRef.content.wasLeft.pipe(take(1)).subscribe((wasLeft: boolean) => {
      if (!wasLeft) {
        return
      }
      this.sortBy(
        this.sortTable.sortParam.column,
        false,
        this.members().filter((member: MemberModel) => member.id !== this.selected().id)
      )
      this.onSelect()
    })
  }

  private focusOn(select: string) {
    const member = this.members().find((item) => item.name === select)
    if (member) {
      setTimeout(() => this.scrollView().scrollInto(member), 100)
      this.onSelect(member)
    }
  }
}
