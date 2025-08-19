/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { KeyValuePipe } from '@angular/common'
import { HttpErrorResponse } from '@angular/common/http'
import { Component, ElementRef, OnInit, ViewChild, inject } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import {
  faAnchor,
  faArrowDown,
  faArrowRotateRight,
  faArrowUp,
  faCircleInfo,
  faPen,
  faPlus,
  faRotate,
  faUpload
} from '@fortawesome/free-solid-svg-icons'
import { ContextMenuComponent, ContextMenuModule } from '@perfectmemory/ngx-contextmenu'
import { SPACE_OPERATION, SPACE_ROLE } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import { USER_PERMISSION } from '@sync-in-server/backend/src/applications/users/constants/user'
import { Member } from '@sync-in-server/backend/src/applications/users/interfaces/member.interface'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { BsModalRef } from 'ngx-bootstrap/modal'
import { TooltipModule } from 'ngx-bootstrap/tooltip'
import { take } from 'rxjs/operators'
import { FilterComponent } from '../../../common/components/filter.component'
import { NavigationViewComponent, ViewMode } from '../../../common/components/navigation-view/navigation-view.component'
import { VirtualScrollComponent } from '../../../common/components/virtual-scroll.component'
import { TableHeaderConfig } from '../../../common/interfaces/table.interface'
import { JoinCountsPipe } from '../../../common/pipes/join-counts.pipe'
import { SearchFilterPipe } from '../../../common/pipes/search.pipe'
import { originalOrderKeyValue } from '../../../common/utils/functions'
import { SortSettings, SortTable } from '../../../common/utils/sort-table'
import { TAB_MENU } from '../../../layout/layout.interfaces'
import { LayoutService } from '../../../layout/layout.service'
import { StoreService } from '../../../store/store.service'
import { FilePermissionsComponent } from '../../files/components/utils/file-permissions.component'
import { SharedChildrenDialogComponent } from '../../shares/components/dialogs/shared-children-dialog.component'
import { UserAvatarComponent } from '../../users/components/utils/user-avatar.component'
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
    FaIconComponent,
    UserAvatarComponent,
    VirtualScrollComponent,
    JoinCountsPipe,
    TooltipModule,
    L10nTranslatePipe,
    ContextMenuModule,
    NavigationViewComponent,
    FilterComponent,
    SearchFilterPipe,
    FilePermissionsComponent
  ],
  templateUrl: 'spaces.component.html'
})
export class SpacesComponent implements OnInit {
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly layout = inject(LayoutService)
  private readonly router = inject(Router)
  private readonly activatedRoute = inject(ActivatedRoute)
  private readonly spacesService = inject(SpacesService)
  private readonly store = inject(StoreService)
  private readonly userService = inject(UserService)
  @ViewChild(VirtualScrollComponent) scrollView: { element: ElementRef; viewPortItems: SpaceModel[]; scrollInto: (arg: SpaceModel | number) => void }
  @ViewChild(FilterComponent, { static: true }) inputFilter: FilterComponent
  @ViewChild(NavigationViewComponent, { static: true }) btnNavigationView: NavigationViewComponent
  @ViewChild('MainContextMenu', { static: true }) mainContextMenu: ContextMenuComponent<any>
  @ViewChild('TargetContextMenu', { static: true }) targetContextMenu: ContextMenuComponent<any>
  protected readonly SPACE_ROLE = SPACE_ROLE
  protected readonly originalOrderKeyValue = originalOrderKeyValue
  protected galleryMode: ViewMode
  protected readonly TAB_MENU = TAB_MENU
  protected readonly icons = {
    SPACES: SPACES_ICON.SPACES,
    SHARED: SPACES_ICON.SHARED_WITH_OTHERS,
    faAnchor,
    faArrowDown,
    faArrowUp,
    faRotate,
    faArrowRotateRight,
    faUpload,
    faPlus,
    faPen,
    faCircleInfo
  }
  // Sort
  protected tableHeaders: Record<'name' | 'managers' | 'members' | 'infos' | 'permissions' | 'modified', TableHeaderConfig> = {
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
      width: 20,
      class: 'd-none d-md-table-cell',
      textCenter: false,
      show: true
    },
    infos: { label: 'Infos', width: 15, textCenter: true, class: 'd-none d-md-table-cell', show: true },
    permissions: {
      label: 'Permissions',
      width: 10,
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
  private readonly sortSettings: SortSettings = {
    default: [{ prop: 'name', type: 'string' }],
    name: [{ prop: 'name', type: 'string' }],
    managers: [{ prop: 'managers', type: 'length' }],
    permissions: [{ prop: 'permissions', type: 'length' }],
    modified: [{ prop: 'modified', type: 'date' }]
  }
  protected sortTable = new SortTable(this.constructor.name, this.sortSettings)
  protected btnSortFields = { name: 'Name', managers: 'Managers', permissions: 'Permissions', modified: 'Modified' }
  // States
  private focusOnSelect: string
  protected loading = false
  protected spaces: SpaceModel[] = []
  protected selected: SpaceModel = null
  protected canCreateSpace = false
  protected canEditSpace = false
  protected canManageRoots = false

  constructor() {
    this.loadSpaces()
    this.canCreateSpace = this.userService.userHavePermission(USER_PERMISSION.SPACES_ADMIN)
    this.layout.setBreadcrumbIcon(SPACES_ICON.SPACES)
    this.layout.setBreadcrumbNav({ url: `/${SPACES_PATH.SPACES}/${SPACES_TITLE.SPACES}`, translating: true, sameLink: true })
    this.activatedRoute.queryParams.subscribe((params) => (this.focusOnSelect = params.select))
  }

  ngOnInit() {
    this.galleryMode = this.btnNavigationView.currentView()
  }

  loadSpaces() {
    this.loading = true
    this.onSelect()
    this.spacesService.listSpaces().subscribe({
      next: (spaces: SpaceModel[]) => {
        this.sortBy(this.sortTable.sortParam.column, false, spaces)
        this.loading = false
        if (this.focusOnSelect) {
          this.focusOn(this.focusOnSelect)
        } else {
          this.scrollView.scrollInto(-1)
        }
      },
      error: (e: HttpErrorResponse) => {
        this.spaces = []
        this.loading = false
        this.layout.sendNotification('error', 'Spaces', e.error.message)
      }
    })
  }

  browse(space: SpaceModel) {
    if (!space.enabled) {
      this.layout.sendNotification('warning', space.name, 'Space is disabled')
    } else {
      this.router.navigate([SPACES_PATH.FILES, space.alias], { relativeTo: this.activatedRoute }).catch((e: Error) => console.error(e))
    }
  }

  onSelect(space: SpaceModel = null) {
    if (space) {
      this.selected = space
      this.canEditSpace = !!space.managers.find((m: Member) => m.id === this.userService.user.id)
      this.canManageRoots = this.canEditSpace || space.havePermission(SPACE_OPERATION.SHARE_INSIDE)
    } else {
      this.selected = null
      this.canEditSpace = false
      this.canManageRoots = false
    }
    this.store.spaceSelection.set(this.selected)
  }

  private focusOn(select: string) {
    const s = this.spaces.find((space) => space.name === select)
    if (s) {
      setTimeout(() => this.scrollView.scrollInto(s), 100)
      this.onSelect(s)
    }
  }

  sortBy(column: string, toUpdate = true, collection?: SpaceModel[]) {
    this.spaces = this.sortTable.sortBy(column, toUpdate, collection || this.spaces)
  }

  onContextMenu(ev: any) {
    ev.preventDefault()
    ev.stopPropagation()
    this.layout.openContextMenu(ev, this.mainContextMenu)
  }

  onTargetContextMenu(ev: any, space: SpaceModel) {
    ev.preventDefault()
    if (ev.type === 'contextmenu') {
      ev.stopPropagation()
    }
    this.onSelect(space)
    this.layout.openContextMenu(ev, this.targetContextMenu)
  }

  openSpaceDialog(add = false) {
    if (add) {
      const modalRef: BsModalRef<SpaceDialogComponent> = this.layout.openDialog(SpaceDialogComponent, 'xl')
      modalRef.content.spaceChange.pipe(take(1)).subscribe((r: ['add' | string, SpaceModel]) => {
        const [action, s] = r
        if (action === 'add') {
          this.sortBy(this.sortTable.sortParam.column, false, this.spaces.concat(s))
          this.onSelect(s)
        }
      })
    } else if (this.selected && this.canEditSpace) {
      this.spacesService.getSpace(this.selected.id).subscribe({
        next: (space: SpaceModel) => {
          const modalRef: BsModalRef<SpaceDialogComponent> = this.layout.openDialog(SpaceDialogComponent, 'xl', {
            initialState: { space: space } as SpaceDialogComponent
          })
          modalRef.content.spaceChange.pipe(take(1)).subscribe((r: ['update' | 'delete' | string, SpaceModel]) => {
            const [action, s] = r
            if (action === 'update') {
              this.selected.name = s.name
              this.selected.alias = s.alias
              this.selected.description = s.description
              // hook to keep the shares count
              this.selected.counts = { ...s.counts, shares: this.selected.counts.shares }
              this.selected.modifiedAt = s.modifiedAt
              this.selected.enabled = s.enabled
              this.selected.managers = [...s.managers]
            } else if (action === 'delete') {
              this.onSelect()
              this.sortBy(
                this.sortTable.sortParam.column,
                false,
                this.spaces.filter((sp: SpaceModel) => sp.id !== s.id)
              )
            }
          })
        },
        error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Edit space', this.selected.name, e)
      })
    }
  }

  openSpaceRootsDialog() {
    setTimeout(
      () => {
        this.layout.openDialog(SpaceUserAnchorsDialogComponent, 'md', {
          initialState: {
            space: this.selected,
            user: this.userService.user
          } as SpaceUserAnchorsDialogComponent
        })
      },
      this.selected ? 0 : 100
    )
  }

  openChildShareDialog(space?: SpaceModel) {
    if (space) this.onSelect(space)
    const modalRef: BsModalRef<SharedChildrenDialogComponent> = this.layout.openDialog(SharedChildrenDialogComponent, null, {
      initialState: { space: this.selected } as SharedChildrenDialogComponent
    })
    modalRef.content.sharesCountEvent.subscribe((sharesCount: number) => (this.selected.counts.shares = sharesCount))
  }
}
