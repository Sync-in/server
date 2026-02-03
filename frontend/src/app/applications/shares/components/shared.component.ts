import { KeyValuePipe } from '@angular/common'
import { HttpErrorResponse } from '@angular/common/http'
import { Component, ElementRef, inject, OnInit, ViewChild } from '@angular/core'
import { ActivatedRoute } from '@angular/router'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import {
  faArrowDown,
  faArrowRotateRight,
  faArrowUp,
  faCircleInfo,
  faCommentDots,
  faEllipsisH,
  faMapMarkerAlt,
  faMinus,
  faPen,
  faPlus,
  faRotate
} from '@fortawesome/free-solid-svg-icons'
import { ContextMenuComponent, ContextMenuModule } from '@perfectmemory/ngx-contextmenu'
import type { ShareFile } from '@sync-in-server/backend/src/applications/shares/interfaces/share-file.interface'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { BsDropdownModule } from 'ngx-bootstrap/dropdown'
import { BsModalRef } from 'ngx-bootstrap/modal'
import { TooltipModule } from 'ngx-bootstrap/tooltip'
import { take } from 'rxjs/operators'
import { FilterComponent } from '../../../common/components/filter.component'
import { NavigationViewComponent, ViewMode } from '../../../common/components/navigation-view/navigation-view.component'
import { VirtualScrollComponent } from '../../../common/components/virtual-scroll.component'
import { TapDirective } from '../../../common/directives/tap.directive'
import { TableHeaderConfig } from '../../../common/interfaces/table.interface'
import { JoinCountsPipe } from '../../../common/pipes/join-counts.pipe'
import { SearchFilterPipe } from '../../../common/pipes/search.pipe'
import { originalOrderKeyValue } from '../../../common/utils/functions'
import { SortSettings, SortTable } from '../../../common/utils/sort-table'
import { TAB_MENU } from '../../../layout/layout.interfaces'
import { LayoutService } from '../../../layout/layout.service'
import { StoreService } from '../../../store/store.service'
import { SPACES_ICON, SPACES_PATH, SPACES_TITLE } from '../../spaces/spaces.constants'
import { ShareFileModel } from '../models/share-file.model'
import { ShareModel } from '../models/share.model'
import { SharesService } from '../services/shares.service'
import { ShareDialogComponent } from './dialogs/share-dialog.component'
import { SharedChildrenDialogComponent } from './dialogs/shared-children-dialog.component'
import { ShareRepositoryComponent } from './utils/share-repository.component'

@Component({
  selector: 'app-shared',
  imports: [
    FaIconComponent,
    KeyValuePipe,
    L10nTranslateDirective,
    L10nTranslatePipe,
    NavigationViewComponent,
    FilterComponent,
    SearchFilterPipe,
    TooltipModule,
    VirtualScrollComponent,
    JoinCountsPipe,
    BsDropdownModule,
    ContextMenuModule,
    ShareRepositoryComponent,
    TapDirective
  ],
  templateUrl: 'shared.component.html'
})
export class SharedComponent implements OnInit {
  @ViewChild(VirtualScrollComponent) scrollView: {
    element: ElementRef
    viewPortItems: ShareFileModel[]
    scrollInto: (arg: ShareFileModel | number) => void
  }
  @ViewChild(FilterComponent, { static: true }) inputFilter: FilterComponent
  @ViewChild(NavigationViewComponent, { static: true }) btnNavigationView: NavigationViewComponent
  @ViewChild('MainContextMenu', { static: true }) mainContextMenu: ContextMenuComponent<any>
  @ViewChild('TargetContextMenu', { static: true }) targetContextMenu: ContextMenuComponent<any>
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly layout = inject(LayoutService)
  protected readonly icons = {
    SHARED: SPACES_ICON.SHARED_WITH_OTHERS,
    faArrowRotateRight,
    faArrowDown,
    faArrowUp,
    faRotate,
    faPlus,
    faMinus,
    faPen,
    faEllipsisH,
    faMapMarkerAlt,
    faCircleInfo,
    faCommentDots
  }
  protected readonly originalOrderKeyValue = originalOrderKeyValue
  protected readonly TAB_MENU = TAB_MENU
  protected loading = false
  protected galleryMode: ViewMode
  protected shares: ShareFileModel[] = []
  protected selected: ShareFileModel = null
  // Sort
  protected tableHeaders: Record<'name' | 'from' | 'members' | 'info' | 'created', TableHeaderConfig> = {
    name: {
      label: 'Name',
      width: 40,
      textCenter: false,
      class: '',
      show: true,
      sortable: true
    },
    from: {
      label: 'Shared from',
      width: 20,
      textCenter: false,
      class: 'd-none d-md-table-cell',
      show: true
    },
    members: {
      label: 'Members',
      width: 16,
      class: 'd-none d-md-table-cell',
      textCenter: false,
      show: true
    },
    info: { label: 'Info', width: 14, textCenter: true, class: 'd-none d-md-table-cell', show: true },
    created: {
      label: 'Created',
      width: 10,
      textCenter: true,
      class: 'd-none d-lg-table-cell',
      newly: 'newly',
      show: true,
      sortable: true
    }
  }
  protected btnSortFields = { name: 'Name', created: 'Created' }
  private readonly activatedRoute = inject(ActivatedRoute)
  private readonly store = inject(StoreService)
  private readonly sharesService = inject(SharesService)
  private focusOnSelect: string
  private readonly sortSettings: SortSettings = {
    default: [{ prop: 'name', type: 'string' }],
    name: [{ prop: 'name', type: 'string' }],
    created: [{ prop: 'createdAt', type: 'date' }]
  }
  protected sortTable = new SortTable(this.constructor.name, this.sortSettings)

  constructor() {
    this.loadShares()
    this.activatedRoute.queryParams.subscribe((params) => (this.focusOnSelect = params.select))
    this.layout.setBreadcrumbIcon(this.icons.SHARED)
    this.layout.setBreadcrumbNav({ url: `/${SPACES_PATH.SHARED}/${SPACES_TITLE.SHARED_WITH_OTHER}`, translating: true, sameLink: true })
  }

  ngOnInit() {
    this.galleryMode = this.btnNavigationView.currentView()
  }

  loadShares() {
    this.loading = true
    this.onSelect()
    this.sharesService.listShares().subscribe({
      next: (shares: ShareFile[]) => {
        this.sortBy(
          this.sortTable.sortParam.column,
          false,
          shares.map((s: ShareFile) => new ShareFileModel(s))
        )
        this.loading = false
        if (this.focusOnSelect) {
          this.focusOn(this.focusOnSelect)
        } else {
          this.scrollView.scrollInto(-1)
        }
      },
      error: (e: HttpErrorResponse) => {
        this.shares = []
        this.loading = false
        this.layout.sendNotification('error', 'Shares', e.error.message)
      }
    })
  }

  sortBy(column: string, toUpdate = true, collection?: ShareFileModel[]) {
    this.shares = this.sortTable.sortBy(column, toUpdate, collection || this.shares)
  }

  onSelect(share: ShareFileModel = null) {
    this.selected = share
    this.store.shareSelection.set(this.selected)
  }

  openShareDialog(add = false) {
    if (add) {
      const modalRef: BsModalRef<ShareDialogComponent> = this.layout.openDialog(ShareDialogComponent, 'lg')
      modalRef.content.shareChange.pipe(take(1)).subscribe((r: ['add' | string, ShareModel]) => {
        const [action, s] = r
        if (action === 'add') {
          this.focusOnSelect = s.name
          this.loadShares()
        }
      })
    } else {
      this.sharesService.getShare(this.selected.id).subscribe({
        next: (share: ShareModel) => {
          const modalRef: BsModalRef<ShareDialogComponent> = this.layout.openDialog(ShareDialogComponent, 'lg', {
            initialState: { share: share } as ShareDialogComponent
          })
          modalRef.content.shareChange.pipe(take(1)).subscribe((r: ['update' | 'delete' | 'add', ShareModel]) => {
            const [action, s] = r
            if (action === 'update') {
              this.selected.name = s.name
              this.selected.alias = s.alias
              this.selected.description = s.description
              this.selected.modifiedAt = s.modifiedAt
              this.selected.enabled = s.enabled
              const counts = { users: 0, groups: 0, links: s.links.length }
              for (const m of s.members) {
                if (m.isUser) {
                  counts.users++
                } else {
                  counts.groups++
                }
              }
              this.selected.counts = { ...this.selected.counts, ...counts }
            } else if (action === 'delete') {
              this.onSelect()
              this.sortBy(
                this.sortTable.sortParam.column,
                false,
                this.shares.filter((share: ShareFileModel) => share.id !== s.id)
              )
            }
          })
        },
        error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Edit share', this.selected.name, e)
      })
    }
  }

  openChildShareDialog(share?: ShareFileModel) {
    if (share) this.onSelect(share)
    const modalRef: BsModalRef<SharedChildrenDialogComponent> = this.layout.openDialog(SharedChildrenDialogComponent, null, {
      initialState: { share: this.selected } as SharedChildrenDialogComponent
    })
    modalRef.content.sharesCountEvent.subscribe((sharesCount: number) => (this.selected.counts.shares = sharesCount))
  }

  onContextMenu(ev: Event) {
    ev.preventDefault()
    ev.stopPropagation()
    this.layout.openContextMenu(ev, this.mainContextMenu)
  }

  onTargetContextMenu(ev: Event, share: ShareFileModel) {
    ev.preventDefault()
    if (ev.type === 'contextmenu') {
      ev.stopPropagation()
    }
    this.onSelect(share)
    this.layout.openContextMenu(ev, this.targetContextMenu)
  }

  goTo(share?: ShareFileModel) {
    share = share || this.selected
    this.sharesService.goTo(share).catch(console.error)
  }

  goToComments(share: ShareFileModel) {
    this.sharesService.goTo(share).then(() => this.layout.showRSideBarTab(TAB_MENU.COMMENTS, true))
  }

  private focusOn(select: string) {
    const s = this.shares.find((share) => share.name === select)
    if (s) {
      setTimeout(() => this.scrollView.scrollInto(s), 100)
      this.onSelect(s)
    }
  }
}
