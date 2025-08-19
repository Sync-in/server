/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { KeyValuePipe } from '@angular/common'
import { HttpErrorResponse } from '@angular/common/http'
import { Component, ElementRef, inject, ViewChild } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, Data, Router } from '@angular/router'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import {
  faArrowDown,
  faArrowRotateRight,
  faArrowUp,
  faKey,
  faRotate,
  faToggleOff,
  faToggleOn,
  faUserPen,
  faUserPlus,
  faUserSecret
} from '@fortawesome/free-solid-svg-icons'
import { ContextMenuComponent, ContextMenuModule } from '@perfectmemory/ngx-contextmenu'
import { USER_ROLE } from '@sync-in-server/backend/src/applications/users/constants/user'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { ButtonCheckboxDirective } from 'ngx-bootstrap/buttons'
import { BsModalRef } from 'ngx-bootstrap/modal'
import { TooltipDirective } from 'ngx-bootstrap/tooltip'
import { take } from 'rxjs/operators'
import { FilterComponent } from '../../../common/components/filter.component'
import { StorageUsageComponent } from '../../../common/components/storage-usage.component'
import { VirtualScrollComponent } from '../../../common/components/virtual-scroll.component'
import { TableHeaderConfig } from '../../../common/interfaces/table.interface'
import { SearchFilterPipe } from '../../../common/pipes/search.pipe'
import { TimeDateFormatPipe } from '../../../common/pipes/time-date-format.pipe'
import { originalOrderKeyValue } from '../../../common/utils/functions'
import { SortSettings, SortTable } from '../../../common/utils/sort-table'
import { LayoutService } from '../../../layout/layout.service'
import { UserAvatarComponent } from '../../users/components/utils/user-avatar.component'
import { GuestUserModel } from '../../users/models/guest.model'
import { ADMIN_ICON, ADMIN_PATH, ADMIN_TITLE } from '../admin.constants'
import { AdminService } from '../admin.service'
import { AdminUserModel } from '../models/admin-user.model'
import { AdminGuestDialogComponent } from './dialogs/admin-guest-dialog.component'
import { AdminImpersonateUserDialogComponent } from './dialogs/admin-impersonate-user-dialog.component'
import { AdminUserDialogComponent } from './dialogs/admin-user-dialog.component'

@Component({
  selector: 'app-admin-users',
  imports: [
    FaIconComponent,
    L10nTranslatePipe,
    FilterComponent,
    TooltipDirective,
    KeyValuePipe,
    L10nTranslateDirective,
    VirtualScrollComponent,
    SearchFilterPipe,
    StorageUsageComponent,
    TimeDateFormatPipe,
    ContextMenuModule,
    ButtonCheckboxDirective,
    FormsModule,
    UserAvatarComponent
  ],
  templateUrl: 'admin-users.component.html'
})
export class AdminUsersComponent {
  @ViewChild(VirtualScrollComponent) scrollView: {
    element: ElementRef
    viewPortItems: AdminUserModel[]
    scrollInto: (arg: AdminUserModel | number) => void
  }
  @ViewChild(FilterComponent, { static: true }) inputFilter: FilterComponent
  @ViewChild('MainContextMenu', { static: true }) mainContextMenu: ContextMenuComponent<any>
  @ViewChild('TargetContextMenu', { static: true }) targetContextMenu: ContextMenuComponent<any>
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly originalOrderKeyValue = originalOrderKeyValue
  protected readonly icons = {
    faRotate,
    faUserPlus,
    faUserPen,
    faArrowDown,
    faArrowUp,
    faKey,
    faUserSecret,
    faArrowRotateRight,
    faToggleOn,
    faToggleOff
  }
  // Sort
  protected tableHeaders: Record<'login' | 'fullName' | 'managers' | 'storage' | 'currentAccess' | 'currentIp' | 'isActive', TableHeaderConfig> = {
    login: {
      label: 'Login',
      width: 30,
      textCenter: false,
      class: '',
      show: true,
      sortable: true
    },
    fullName: {
      label: 'Full name',
      width: 15,
      class: '',
      textCenter: false,
      show: true,
      sortable: true
    },
    managers: {
      label: 'Managers',
      width: 15,
      class: 'd-none d-md-table-cell',
      textCenter: true,
      show: false,
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
    isActive: {
      label: 'Status',
      width: 10,
      textCenter: true,
      class: 'd-none d-lg-table-cell',
      show: true,
      sortable: true
    },
    currentIp: {
      label: 'IP',
      width: 10,
      textCenter: false,
      class: 'd-none d-lg-table-cell',
      show: true
    },
    currentAccess: {
      label: 'Seen',
      width: 12,
      textCenter: true,
      class: 'd-none d-lg-table-cell',
      newly: 'newly',
      show: true,
      sortable: true
    }
  }
  // States
  protected guestsView = false
  protected loading = false
  protected selected: AdminUserModel = null
  protected users: AdminUserModel[] = []
  private readonly router = inject(Router)
  private readonly activatedRoute = inject(ActivatedRoute)
  private readonly layout = inject(LayoutService)
  private readonly adminService = inject(AdminService)
  private readonly sortSettings: SortSettings = {
    default: [{ prop: 'login', type: 'string' }],
    login: [{ prop: 'login', type: 'string' }],
    fullName: [{ prop: 'fullName', type: 'string' }],
    managers: [{ prop: 'managers', type: 'length' }],
    storage: [{ prop: 'storageUsage', type: 'number' }],
    currentAccess: [{ prop: 'currentAccess', type: 'date' }],
    isActive: [{ prop: 'isActive', type: 'number' }]
  }
  protected sortTable = new SortTable(this.constructor.name, this.sortSettings)

  constructor() {
    this.layout.setBreadcrumbIcon(ADMIN_ICON.USERS)
    this.activatedRoute.data.subscribe((route: Data) => {
      this.guestsView = route.type === USER_ROLE.GUEST
      this.setEnv()
    })
  }

  loadUsersOrGuests() {
    this.loading = true
    this.onSelect()
    this.adminService.listUsers(this.guestsView).subscribe({
      next: (users: AdminUserModel[]) => {
        this.sortBy(this.sortTable.sortParam.column, false, users)
        this.scrollView.scrollInto(-1)
        this.loading = false
      },
      error: (e: HttpErrorResponse) => {
        this.users = []
        this.layout.sendNotification('error', this.guestsView ? 'Guests' : 'Users', 'Unable to load', e)
        this.loading = false
      }
    })
  }

  onSelect(user: AdminUserModel = null) {
    this.selected = user
  }

  onGuestsView(state: boolean) {
    this.guestsView = state
    this.router.navigate([ADMIN_PATH.BASE, state ? ADMIN_PATH.GUESTS : ADMIN_PATH.USERS]).catch(console.error)
  }

  onContextMenu(ev: any) {
    ev.preventDefault()
    ev.stopPropagation()
    this.layout.openContextMenu(ev, this.mainContextMenu)
  }

  onTargetContextMenu(ev: any, user: AdminUserModel) {
    ev.preventDefault()
    if (ev.type === 'contextmenu') {
      ev.stopPropagation()
    }
    this.onSelect(user)
    this.layout.openContextMenu(ev, this.targetContextMenu)
  }

  sortBy(column: string, toUpdate = true, collection?: AdminUserModel[]) {
    this.users = this.sortTable.sortBy(column, toUpdate, collection || this.users)
  }

  openDialog(add = false) {
    if (this.guestsView) {
      this.openGuestDialog(add)
    } else {
      this.openUserDialog(add)
    }
  }

  openUserDialog(add = false) {
    if (add) {
      const modalRef: BsModalRef<AdminUserDialogComponent> = this.layout.openDialog(AdminUserDialogComponent, 'md')
      modalRef.content.userChange.pipe(take(1)).subscribe((r: ['add' | string, AdminUserModel]) => {
        const [action, u] = r
        if (action === 'add') {
          this.sortBy(this.sortTable.sortParam.column, false, [...this.users, u])
          this.onSelect(u)
        }
      })
    } else {
      this.adminService.getUser(this.selected.id).subscribe({
        next: (user: AdminUserModel) => {
          const modalRef: BsModalRef<AdminUserDialogComponent> = this.layout.openDialog(AdminUserDialogComponent, 'md', {
            initialState: { user: user } as AdminUserDialogComponent
          })
          modalRef.content.userChange.pipe(take(1)).subscribe((r: ['add' | 'update' | 'delete', AdminUserModel]) => {
            const [action, u] = r
            if (action === 'update') {
              this.selected = Object.assign(this.selected, u)
            } else if (action === 'delete') {
              this.onSelect()
              this.sortBy(
                this.sortTable.sortParam.column,
                false,
                this.users.filter((user) => user.id !== u.id)
              )
            }
          })
        },
        error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Edit group', this.selected.login, e)
      })
    }
  }

  openGuestDialog(add = false) {
    if (add) {
      const modalRef: BsModalRef<AdminGuestDialogComponent> = this.layout.openDialog(AdminGuestDialogComponent, 'md')
      modalRef.content.guestChange.pipe(take(1)).subscribe((r: ['add' | string, GuestUserModel]) => {
        const [action, g] = r
        const u = new AdminUserModel(g)
        if (action === 'add') {
          this.sortBy(this.sortTable.sortParam.column, false, [...this.users, u])
          this.onSelect(u)
        }
      })
    } else {
      this.adminService.getUser(this.selected.id, true).subscribe({
        next: (guest: GuestUserModel) => {
          const modalRef: BsModalRef<AdminGuestDialogComponent> = this.layout.openDialog(AdminGuestDialogComponent, 'md', {
            initialState: {
              guest: guest
            } as AdminGuestDialogComponent
          })
          modalRef.content.guestChange.pipe(take(1)).subscribe((r: ['add' | 'update' | 'delete', GuestUserModel]) => {
            const [action, g] = r
            if (action === 'update') {
              this.selected = Object.assign(this.selected, g)
            } else if (action === 'delete') {
              this.onSelect()
              this.sortBy(
                this.sortTable.sortParam.column,
                false,
                this.users.filter((user) => user.id !== g.id)
              )
            }
          })
        },
        error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Guest error', this.selected.fullName, e)
      })
    }
  }

  impersonateIdentity() {
    this.layout.openDialog(AdminImpersonateUserDialogComponent, 'sm', {
      initialState: { user: this.selected } as AdminImpersonateUserDialogComponent
    })
  }

  private setEnv() {
    this.tableHeaders.managers.show = this.guestsView
    this.tableHeaders.storage.show = !this.guestsView
    this.loadUsersOrGuests()
    this.layout.setBreadcrumbNav({
      url: this.guestsView
        ? `/${ADMIN_PATH.BASE}/${ADMIN_PATH.GUESTS}/${ADMIN_TITLE.GUESTS}`
        : `/${ADMIN_PATH.BASE}/${ADMIN_PATH.USERS}/${ADMIN_TITLE.USERS}`,
      splicing: 2,
      translating: true,
      sameLink: true
    })
  }
}
