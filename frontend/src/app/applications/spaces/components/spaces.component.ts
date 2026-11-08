import { KeyValuePipe } from '@angular/common'
import { HttpErrorResponse } from '@angular/common/http'
import { Component, computed, inject, OnInit, signal, viewChild, ViewChild } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { ActivatedRoute, Router } from '@angular/router'
import {
  LucideAnchor,
  LucideArrowDown,
  LucideArrowUp,
  LucideDynamicIcon,
  LucideHardDriveUpload,
  LucidePencil,
  LucidePlus,
  LucideRotateCw
} from '@lucide/angular'
import { ContextMenuComponent, ContextMenuModule } from '@perfectmemory/ngx-contextmenu'
import { SPACE_OPERATION, SPACE_ROLE } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import { USER_PERMISSION } from '@sync-in-server/backend/src/applications/users/constants/user'
import { Member } from '@sync-in-server/backend/src/applications/users/interfaces/member.interface'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { BsModalRef } from 'ngx-bootstrap/modal'
import { TooltipModule } from 'ngx-bootstrap/tooltip'
import { take } from 'rxjs/operators'
import { BadgeMembersComponent } from '../../../common/components/badge-members.component'
import { BadgePermissionsComponent } from '../../../common/components/badge-permissions.component'
import { NavigationViewComponent, ViewMode } from '../../../common/components/navigation-view/navigation-view.component'
import { VirtualScrollComponent } from '../../../common/components/virtual-scroll.component'
import { TapDirective } from '../../../common/directives/tap.directive'
import { TableHeaderConfig } from '../../../common/interfaces/table.interface'
import { SearchFilterPipe } from '../../../common/pipes/search.pipe'
import { originalOrderKeyValue } from '../../../common/utils/functions'
import { SortSettings, SortTable } from '../../../common/utils/sort-table'
import { TAB_MENU } from '../../../layout/layout.interfaces'
import { LayoutService } from '../../../layout/layout.service'
import { NavbarSearchService } from '../../../layout/navbar/services/navbar-search.service'
import { StoreService } from '../../../store/store.service'
import { SharedChildrenDialogComponent } from '../../shares/components/dialogs/shared-children-dialog.component'
import { UserAvatarStackComponent } from '../../users/components/utils/user-avatar-stack.component'
import { UserService } from '../../users/user.service'
import { SpaceModel } from '../models/space.model'
import { SpacesService } from '../services/spaces.service'
import { SPACES_ICON, SPACES_PATH, SPACES_TITLE } from '../spaces.constants'
import { SpaceDialogComponent } from './dialogs/space-dialog.component'
import { SpaceUserAnchorsDialogComponent } from './dialogs/space-user-anchors-dialog.component'

@Component({
  selector: 'app-spaces',
  imports: [
    KeyValuePipe,
    L10nTranslateDirective,
    LucideDynamicIcon,
    UserAvatarStackComponent,
    VirtualScrollComponent,
    TooltipModule,
    L10nTranslatePipe,
    ContextMenuModule,
    NavigationViewComponent,
    SearchFilterPipe,
    BadgePermissionsComponent,
    TapDirective,
    BadgeMembersComponent
  ],
  templateUrl: 'spaces.component.html'
})
export class SpacesComponent implements OnInit {
  protected readonly scrollView = viewChild<VirtualScrollComponent<SpaceModel>>(VirtualScrollComponent)
  @ViewChild(NavigationViewComponent, { static: true }) btnNavigationView: NavigationViewComponent
  readonly mainContextMenu = viewChild.required<ContextMenuComponent<any>>('MainContextMenu')
  readonly targetContextMenu = viewChild.required<ContextMenuComponent<any>>('TargetContextMenu')
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly layout = inject(LayoutService)
  protected readonly navbarSearch = inject(NavbarSearchService)
  protected readonly SPACE_ROLE = SPACE_ROLE
  protected readonly originalOrderKeyValue = originalOrderKeyValue
  protected readonly galleryMode = signal<ViewMode>(undefined)
  protected readonly TAB_MENU = TAB_MENU
  protected readonly icons = {
    SPACES: SPACES_ICON.SPACES,
    SHARES: SPACES_ICON.SHARES,
    LucideAnchor,
    LucideArrowDown,
    LucideArrowUp,
    LucideRotateCw,
    LucideHardDriveUpload,
    LucidePlus,
    LucidePencil,
    SELECTION: SPACES_ICON.SELECTION
  }
  // Sort
  protected tableHeaders: Record<'name' | 'managers' | 'members' | 'info' | 'permissions' | 'modified', TableHeaderConfig> = {
    name: {
      label: 'Name',
      width: 30,
      textCenter: false,
      class: '',
      show: true,
      sortable: true
    },
    managers: {
      label: 'Managers',
      width: 10,
      class: 'd-none d-md-table-cell',
      textCenter: true,
      show: true,
      sortable: true
    },
    members: {
      label: 'Members',
      width: 16,
      class: 'd-none d-md-table-cell',
      textCenter: false,
      show: true
    },
    info: { label: 'Info', width: 15, textCenter: true, class: 'd-none d-md-table-cell', show: true },
    permissions: {
      label: 'Permissions',
      width: 12,
      textCenter: true,
      class: 'd-none d-lg-table-cell',
      show: true,
      sortable: true
    },
    modified: {
      label: 'Modified',
      width: 10,
      textCenter: true,
      class: 'd-none d-lg-table-cell',
      newly: 'newly',
      show: true,
      sortable: true
    }
  }
  protected readonly canCreateSpace = signal(false)
  protected readonly canManageSpaces = signal(false)
  protected readonly canUsePersonalSpace = signal(false)
  private readonly router = inject(Router)
  private readonly activatedRoute = inject(ActivatedRoute)
  private readonly spacesService = inject(SpacesService)
  private readonly store = inject(StoreService)
  private readonly userService = inject(UserService)
  protected readonly loading = signal(false)
  protected readonly spaces = signal<SpaceModel[]>([])
  protected readonly selected = signal<SpaceModel>(null, { equal: () => false })
  protected readonly canEditSpace = computed(() => !!this.selected()?.managers.find((m: Member) => m.id === this.userService.user.id))
  protected readonly canManageRoots = computed(
    () => this.canUsePersonalSpace() && (this.canEditSpace() || !!this.selected()?.havePermission(SPACE_OPERATION.SHARE_INSIDE))
  )
  private readonly sortSettings: SortSettings = {
    default: [{ prop: 'name', type: 'string' }],
    name: [{ prop: 'name', type: 'string' }],
    managers: [{ prop: 'managers', type: 'length' }],
    permissions: [{ prop: 'permissions', type: 'length' }],
    modified: [{ prop: 'modifiedAt', type: 'date' }]
  }
  protected sortTable = new SortTable(this.constructor.name, this.sortSettings)
  // States
  private focusOnSelect: string

  constructor() {
    this.loadSpaces()
    this.canCreateSpace.set(this.userService.userHavePermission(USER_PERMISSION.SPACES_ADMIN))
    this.canManageSpaces.set(this.userService.user.isUser)
    this.canUsePersonalSpace.set(this.userService.userHavePermission(USER_PERMISSION.PERSONAL_SPACE))
    this.layout.setBreadcrumbIcon(SPACES_ICON.SPACES)
    this.layout.setBreadcrumbNav({ url: `/${SPACES_PATH.SPACES}/${SPACES_TITLE.COLLABORATIVE_SPACES}`, translating: true, sameLink: true })
    this.activatedRoute.queryParams.subscribe((params) => (this.focusOnSelect = params.select))
    this.spacesService.spaceModelChanged.pipe(takeUntilDestroyed()).subscribe((space) => {
      if (this.spaces().includes(space)) this.notifySpaceMutation(space)
    })
  }

  ngOnInit() {
    this.galleryMode.set(this.btnNavigationView.currentView())
  }

  loadSpaces() {
    this.loading.set(true)
    this.onSelect()
    this.spacesService.listSpaces().subscribe({
      next: (spaces: SpaceModel[]) => {
        this.sortBy(this.sortTable.sortParam.column, false, spaces)
        this.loading.set(false)
        if (this.focusOnSelect) {
          this.focusOn(this.focusOnSelect)
        } else {
          this.scrollView()?.scrollInto(-1)
        }
      },
      error: (e: HttpErrorResponse) => {
        this.spaces.set([])
        this.loading.set(false)
        this.layout.sendNotification('error', 'Spaces', e.error.message)
      }
    })
  }

  browse(space: SpaceModel) {
    if (!space.enabled) {
      this.layout.sendNotification('warning', space.name, 'Space is disabled')
    } else {
      this.router.navigate([SPACES_PATH.FILES, space.alias], { relativeTo: this.activatedRoute }).catch(console.error)
    }
  }

  onSpaceActivate(space: SpaceModel) {
    this.onSelect(space)
    this.browse(space)
  }

  onSelect(space: SpaceModel = null) {
    this.selected.set(space)
    this.store.spaceSelection.set(this.selected())
  }

  sortBy(column: string, toUpdate = true, collection?: SpaceModel[]) {
    this.spaces.set(this.sortTable.sortBy(column, toUpdate, collection || this.spaces()))
  }

  onContextMenu(ev: any) {
    ev.preventDefault()
    ev.stopPropagation()
    this.layout.openContextMenu(ev, this.mainContextMenu())
  }

  onTargetContextMenu(ev: any, space: SpaceModel) {
    ev.preventDefault()
    if (ev.type === 'contextmenu') {
      ev.stopPropagation()
    }
    this.onSelect(space)
    this.layout.openContextMenu(ev, this.targetContextMenu())
  }

  openSpaceDialog(add = false) {
    if (add) {
      const modalRef: BsModalRef<SpaceDialogComponent> = this.layout.openDialog(SpaceDialogComponent, 'xl')
      modalRef.content.spaceChange.pipe(take(1)).subscribe((r: ['add' | string, SpaceModel]) => {
        const [action, s] = r
        if (action === 'add') {
          this.sortBy(this.sortTable.sortParam.column, false, this.spaces().concat(s))
          this.onSelect(s)
        }
      })
    } else if (this.selected() && this.canEditSpace()) {
      this.spacesService.getSpace(this.selected()!.id).subscribe({
        next: (space: SpaceModel) => {
          const modalRef: BsModalRef<SpaceDialogComponent> = this.layout.openDialog(SpaceDialogComponent, 'xl', {
            initialState: { space: space } as SpaceDialogComponent
          })
          modalRef.content.spaceChange.pipe(take(1)).subscribe((r: ['update' | 'delete' | string, SpaceModel]) => {
            const [action, s] = r
            if (action === 'update') {
              this.selected()!.name = s.name
              this.selected()!.alias = s.alias
              this.selected()!.description = s.description
              this.selected()!.counts = { ...s.counts, shares: this.selected()!.counts.shares }
              this.selected()!.modifiedAt = s.modifiedAt
              this.selected()!.enabled = s.enabled
              this.selected()!.managers = [...s.managers]
              this.notifySpaceMutation(this.selected()!)
            } else if (action === 'delete') {
              this.onSelect()
              this.sortBy(
                this.sortTable.sortParam.column,
                false,
                this.spaces().filter((sp: SpaceModel) => sp.id !== s.id)
              )
            }
          })
        },
        error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Edit space', this.selected()!.name, e)
      })
    }
  }

  openSpaceRootsDialog() {
    setTimeout(
      () => {
        const modalRef: BsModalRef<SpaceUserAnchorsDialogComponent> = this.layout.openDialog(SpaceUserAnchorsDialogComponent, 'md', {
          initialState: {
            space: this.selected(),
            user: this.userService.user
          } as SpaceUserAnchorsDialogComponent
        })
        modalRef.content.rootsChange.subscribe((space: SpaceModel) => this.notifySpaceMutation(space))
      },
      this.selected() ? 0 : 100
    )
  }

  openChildShareDialog(space?: SpaceModel) {
    if (space) this.onSelect(space)
    const modalRef: BsModalRef<SharedChildrenDialogComponent> = this.layout.openDialog(SharedChildrenDialogComponent, null, {
      initialState: { space: this.selected() } as SharedChildrenDialogComponent
    })
    modalRef.content.sharesCountEvent.subscribe((sharesCount: number) => {
      this.selected()!.counts.shares = sharesCount
      this.notifySpaceMutation(this.selected()!)
    })
  }

  private notifySpaceMutation(space: SpaceModel) {
    this.spaces.update((spaces) => [...spaces])
    if (this.selected() === space) {
      this.selected.set(space)
      this.store.spaceSelection.set(space)
    }
  }

  private focusOn(select: string) {
    const space = this.spaces().find((item) => item.name === select)
    if (space) {
      setTimeout(() => this.scrollView()?.scrollInto(space), 100)
      this.onSelect(space)
    }
  }
}
