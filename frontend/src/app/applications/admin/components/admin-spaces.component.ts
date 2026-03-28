import { KeyValuePipe } from '@angular/common'
import { HttpErrorResponse } from '@angular/common/http'
import { Component, ElementRef, inject, ViewChild } from '@angular/core'
import { ActivatedRoute } from '@angular/router'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faArrowDown, faArrowRotateRight, faArrowUp, faCircleInfo, faPen, faPlus, faRotate, faUpload } from '@fortawesome/free-solid-svg-icons'
import { ContextMenuComponent, ContextMenuModule } from '@perfectmemory/ngx-contextmenu'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { BsModalRef } from 'ngx-bootstrap/modal'
import { TooltipModule } from 'ngx-bootstrap/tooltip'
import { take } from 'rxjs/operators'
import { BadgeMembersComponent } from '../../../common/components/badge-members.component'
import { FilterComponent } from '../../../common/components/filter.component'
import { StorageUsageComponent } from '../../../common/components/storage-usage.component'
import { VirtualScrollComponent } from '../../../common/components/virtual-scroll.component'
import { TapDirective } from '../../../common/directives/tap.directive'
import { TableHeaderConfig } from '../../../common/interfaces/table.interface'
import { SearchFilterPipe } from '../../../common/pipes/search.pipe'
import { originalOrderKeyValue } from '../../../common/utils/functions'
import { SortSettings, SortTable } from '../../../common/utils/sort-table'
import { TAB_MENU } from '../../../layout/layout.interfaces'
import { LayoutService } from '../../../layout/layout.service'
import { SharedChildrenDialogComponent } from '../../shares/components/dialogs/shared-children-dialog.component'
import { SpaceDialogComponent } from '../../spaces/components/dialogs/space-dialog.component'
import type { SpaceModel } from '../../spaces/models/space.model'
import { SpacesService } from '../../spaces/services/spaces.service'
import { SPACES_ICON } from '../../spaces/spaces.constants'
import { UserAvatarComponent } from '../../users/components/utils/user-avatar.component'
import { ADMIN_ICON, ADMIN_PATH, ADMIN_TITLE } from '../admin.constants'
import { AdminService } from '../admin.service'

@Component({
  selector: 'app-admin-spaces',
  imports: [
    KeyValuePipe,
    L10nTranslateDirective,
    FaIconComponent,
    UserAvatarComponent,
    VirtualScrollComponent,
    TooltipModule,
    L10nTranslatePipe,
    ContextMenuModule,
    FilterComponent,
    SearchFilterPipe,
    TapDirective,
    BadgeMembersComponent,
    StorageUsageComponent
  ],
  templateUrl: 'admin-spaces.component.html'
})
export class AdminSpacesComponent {
  @ViewChild(VirtualScrollComponent) scrollView: { element: ElementRef; viewPortItems: SpaceModel[]; scrollInto: (arg: SpaceModel | number) => void }
  @ViewChild(FilterComponent, { static: true }) inputFilter: FilterComponent
  @ViewChild('MainContextMenu', { static: true }) mainContextMenu: ContextMenuComponent<any>
  @ViewChild('TargetContextMenu', { static: true }) targetContextMenu: ContextMenuComponent<any>
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly layout = inject(LayoutService)
  protected readonly originalOrderKeyValue = originalOrderKeyValue
  protected readonly TAB_MENU = TAB_MENU
  protected readonly icons = {
    SPACES: ADMIN_ICON.SPACES,
    SHARED: SPACES_ICON.SHARED_WITH_OTHERS,
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
  protected tableHeaders: Record<'name' | 'managers' | 'storage' | 'members' | 'info' | 'modified', TableHeaderConfig> = {
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
      width: 12,
      class: 'd-none d-md-table-cell',
      textCenter: true,
      show: true,
      sortable: true
    },
    storage: {
      label: 'Storage Space',
      width: 15,
      class: 'd-none d-md-table-cell',
      textCenter: true,
      show: true,
      sortable: true
    },
    members: {
      label: 'Members',
      width: 15,
      class: 'd-none d-lg-table-cell',
      textCenter: true,
      show: true
    },
    info: { label: 'Info', width: 8, textCenter: true, class: 'd-none d-md-table-cell', show: true },
    modified: {
      label: 'Modified',
      width: 8,
      textCenter: true,
      class: 'd-none d-lg-table-cell',
      newly: 'newly',
      show: true,
      sortable: true
    }
  }
  protected loading = false
  protected spaces: SpaceModel[] = []
  protected selected: SpaceModel = null
  private readonly activatedRoute = inject(ActivatedRoute)
  private readonly spacesService = inject(SpacesService)
  private readonly adminService = inject(AdminService)
  private readonly sortSettings: SortSettings = {
    default: [{ prop: 'name', type: 'string' }],
    name: [{ prop: 'name', type: 'string' }],
    managers: [{ prop: 'managers', type: 'length' }],
    storage: [{ prop: 'storageUsage', type: 'number' }],
    modified: [{ prop: 'modifiedAt', type: 'date' }]
  }
  protected sortTable = new SortTable(this.constructor.name, this.sortSettings)
  // States
  private focusOnSelect: string

  constructor() {
    this.loadSpaces()
    this.layout.setBreadcrumbIcon(ADMIN_ICON.SPACES)
    this.layout.setBreadcrumbNav({
      url: `/${ADMIN_PATH.BASE}/${ADMIN_PATH.SPACES}/${ADMIN_TITLE.SPACES}`,
      splicing: 2,
      translating: true,
      sameLink: true
    })
    this.activatedRoute.queryParams.subscribe((params) => (this.focusOnSelect = params.select))
  }

  loadSpaces() {
    this.loading = true
    this.onSelect()
    this.adminService.listSpaces().subscribe({
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

  onSelect(space: SpaceModel = null) {
    this.selected = space ?? null
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
    } else if (this.selected) {
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
              this.selected.storageUsage = s.storageUsage
              this.selected.storageQuota = s.storageQuota
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

  openChildShareDialog(space?: SpaceModel) {
    if (space) this.onSelect(space)
    const modalRef: BsModalRef<SharedChildrenDialogComponent> = this.layout.openDialog(SharedChildrenDialogComponent, null, {
      initialState: { space: this.selected } as SharedChildrenDialogComponent
    })
    modalRef.content.sharesCountEvent.subscribe((sharesCount: number) => (this.selected.counts.shares = sharesCount))
  }

  private focusOn(select: string) {
    const s = this.spaces.find((space) => space.name === select)
    if (s) {
      setTimeout(() => this.scrollView.scrollInto(s), 100)
      this.onSelect(s)
    }
  }
}
