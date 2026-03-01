import { KeyValuePipe } from '@angular/common'
import { HttpErrorResponse } from '@angular/common/http'
import { Component, ElementRef, inject, ViewChild } from '@angular/core'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faArrowDown, faArrowRotateRight, faArrowUp, faKey, faPen, faPlus, faRotate } from '@fortawesome/free-solid-svg-icons'
import { ContextMenuComponent, ContextMenuModule } from '@perfectmemory/ngx-contextmenu'
import { USER_PERMISSION } from '@sync-in-server/backend/src/applications/users/constants/user'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { BsModalRef } from 'ngx-bootstrap/modal'
import { TooltipDirective } from 'ngx-bootstrap/tooltip'
import { take } from 'rxjs/operators'
import { FilterComponent } from '../../../common/components/filter.component'
import { VirtualScrollComponent } from '../../../common/components/virtual-scroll.component'
import { TapDirective } from '../../../common/directives/tap.directive'
import { TableHeaderConfig } from '../../../common/interfaces/table.interface'
import { SearchFilterPipe } from '../../../common/pipes/search.pipe'
import { TimeAgoPipe } from '../../../common/pipes/time-ago.pipe'
import { TimeDateFormatPipe } from '../../../common/pipes/time-date-format.pipe'
import { originalOrderKeyValue } from '../../../common/utils/functions'
import { SortSettings, SortTable } from '../../../common/utils/sort-table'
import { LayoutService } from '../../../layout/layout.service'
import { GuestUserModel } from '../models/guest.model'
import { USER_ICON, USER_PATH, USER_TITLE } from '../user.constants'
import { UserService } from '../user.service'
import { UserGuestDialogComponent } from './dialogs/user-guest-dialog.component'
import { UserAvatarComponent } from './utils/user-avatar.component'

@Component({
  selector: 'app-user-guests',
  imports: [
    FaIconComponent,
    L10nTranslatePipe,
    FilterComponent,
    TooltipDirective,
    KeyValuePipe,
    L10nTranslateDirective,
    VirtualScrollComponent,
    SearchFilterPipe,
    TimeDateFormatPipe,
    ContextMenuModule,
    UserAvatarComponent,
    TapDirective,
    TimeAgoPipe
  ],
  templateUrl: 'user-guests.component.html'
})
export class UserGuestsComponent {
  @ViewChild(VirtualScrollComponent) scrollView: {
    element: ElementRef
    viewPortItems: GuestUserModel[]
    scrollInto: (arg: GuestUserModel | number) => void
  }
  @ViewChild(FilterComponent, { static: true }) inputFilter: FilterComponent
  @ViewChild('MainContextMenu', { static: true }) mainContextMenu: ContextMenuComponent<any>
  @ViewChild('TargetContextMenu', { static: true }) targetContextMenu: ContextMenuComponent<any>
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly originalOrderKeyValue = originalOrderKeyValue
  protected readonly icons = { faRotate, faPlus, faPen, faArrowDown, faArrowUp, faKey, faArrowRotateRight }
  // Sort
  protected tableHeaders: Record<'login' | 'fullName' | 'managers' | 'currentAccess' | 'createdAt' | 'isActive', TableHeaderConfig> = {
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
      class: 'd-none d-md-table-cell',
      textCenter: false,
      show: true,
      sortable: true
    },
    managers: {
      label: 'Managers',
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
    createdAt: {
      label: 'Created',
      width: 12,
      textCenter: true,
      class: 'd-none d-lg-table-cell',
      show: true,
      sortable: true
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
  protected loading = false
  protected selected: GuestUserModel = null
  protected guests: GuestUserModel[] = []
  private readonly layout = inject(LayoutService)
  private readonly userService = inject(UserService)
  // States
  protected canCreateGuest = this.userService.userHavePermission(USER_PERMISSION.GUESTS_ADMIN)
  private readonly sortSettings: SortSettings = {
    default: [{ prop: 'login', type: 'string' }],
    login: [{ prop: 'login', type: 'string' }],
    fullName: [{ prop: 'fullName', type: 'string' }],
    managers: [{ prop: 'managers', type: 'length' }],
    storage: [{ prop: 'storageUsage', type: 'number' }],
    currentAccess: [{ prop: 'currentAccess', type: 'date' }],
    createdAt: [{ prop: 'createdAt', type: 'date' }],
    isActive: [{ prop: 'isActive', type: 'number' }]
  }
  protected sortTable = new SortTable(this.constructor.name, this.sortSettings)

  constructor() {
    this.loadGuests()
    this.layout.setBreadcrumbIcon(USER_ICON.GUESTS)
    this.layout.setBreadcrumbNav({
      url: `/${USER_PATH.BASE}/${USER_PATH.GUESTS}/${USER_TITLE.GUESTS}`,
      splicing: 2,
      translating: true,
      sameLink: true
    })
  }

  loadGuests() {
    this.loading = true
    this.onSelect()
    this.userService.listGuests().subscribe({
      next: (users: GuestUserModel[]) => {
        this.sortBy(this.sortTable.sortParam.column, false, users)
        this.scrollView.scrollInto(-1)
        this.loading = false
      },
      error: (e: HttpErrorResponse) => {
        this.guests = []
        this.layout.sendNotification('error', 'Guests', e.error.message)
        this.loading = false
      }
    })
  }

  onSelect(user: GuestUserModel = null) {
    this.selected = user
  }

  onContextMenu(ev: any) {
    ev.preventDefault()
    ev.stopPropagation()
    this.layout.openContextMenu(ev, this.mainContextMenu)
  }

  onTargetContextMenu(ev: any, user: GuestUserModel) {
    ev.preventDefault()
    if (ev.type === 'contextmenu') {
      ev.stopPropagation()
    }
    this.onSelect(user)
    this.layout.openContextMenu(ev, this.targetContextMenu)
  }

  sortBy(column: string, toUpdate = true, collection?: GuestUserModel[]) {
    this.guests = this.sortTable.sortBy(column, toUpdate, collection || this.guests)
  }

  openGuestDialog(add = false) {
    if (add) {
      const modalRef: BsModalRef<UserGuestDialogComponent> = this.layout.openDialog(UserGuestDialogComponent, 'md')
      modalRef.content.guestChange.pipe(take(1)).subscribe((r: ['add' | string, GuestUserModel]) => {
        const [action, g] = r
        if (action === 'add') {
          this.sortBy(this.sortTable.sortParam.column, false, [...this.guests, g])
          this.onSelect(g)
        }
      })
    } else {
      this.userService.getGuest(this.selected.id).subscribe({
        next: (guest: GuestUserModel) => {
          const modalRef: BsModalRef<UserGuestDialogComponent> = this.layout.openDialog(UserGuestDialogComponent, 'md', {
            initialState: {
              guest: guest
            } as UserGuestDialogComponent
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
                this.guests.filter((guest) => guest.id !== g.id)
              )
            }
          })
        },
        error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Guest error', this.selected.fullName, e)
      })
    }
  }
}
