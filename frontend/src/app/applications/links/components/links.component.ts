/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

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
  faClipboard,
  faClipboardCheck,
  faClock,
  faEllipsisH,
  faLink,
  faLock,
  faMapMarkerAlt,
  faPen
} from '@fortawesome/free-solid-svg-icons'
import { ContextMenuComponent, ContextMenuModule } from '@perfectmemory/ngx-contextmenu'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { BsModalRef } from 'ngx-bootstrap/modal'
import { TooltipModule } from 'ngx-bootstrap/tooltip'
import { take } from 'rxjs/operators'
import { FilterComponent } from '../../../common/components/filter.component'
import { NavigationViewComponent, ViewMode } from '../../../common/components/navigation-view/navigation-view.component'
import { VirtualScrollComponent } from '../../../common/components/virtual-scroll.component'
import { TapDirective } from '../../../common/directives/tap.directive'
import { TableHeaderConfig } from '../../../common/interfaces/table.interface'
import { SearchFilterPipe } from '../../../common/pipes/search.pipe'
import { originalOrderKeyValue } from '../../../common/utils/functions'
import { SortSettings, SortTable } from '../../../common/utils/sort-table'
import { TAB_MENU } from '../../../layout/layout.interfaces'
import { LayoutService } from '../../../layout/layout.service'
import { StoreService } from '../../../store/store.service'
import { FilePermissionsComponent } from '../../files/components/utils/file-permissions.component'
import { ShareRepositoryComponent } from '../../shares/components/utils/share-repository.component'
import { ShareModel } from '../../shares/models/share.model'
import { SharesService } from '../../shares/services/shares.service'
import { SPACES_PATH, SPACES_TITLE } from '../../spaces/spaces.constants'
import { ShareLinkModel } from '../models/share-link.model'
import { LinksService } from '../services/links.service'
import { LinkDialogComponent } from './dialogs/link-dialog.component'

@Component({
  selector: 'app-shared-links',
  imports: [
    ContextMenuModule,
    FaIconComponent,
    KeyValuePipe,
    L10nTranslateDirective,
    L10nTranslatePipe,
    NavigationViewComponent,
    TooltipModule,
    FilterComponent,
    VirtualScrollComponent,
    SearchFilterPipe,
    ShareRepositoryComponent,
    FilePermissionsComponent,
    TapDirective
  ],
  templateUrl: 'links.component.html'
})
export class LinksComponent implements OnInit {
  @ViewChild(VirtualScrollComponent) scrollView: {
    element: ElementRef
    viewPortItems: ShareLinkModel[]
    scrollInto: (arg: ShareLinkModel | number) => void
  }
  @ViewChild(FilterComponent, { static: true }) inputFilter: FilterComponent
  @ViewChild(NavigationViewComponent, { static: true }) btnNavigationView: NavigationViewComponent
  @ViewChild('MainContextMenu', { static: true }) mainContextMenu: ContextMenuComponent<any>
  @ViewChild('TargetContextMenu', { static: true }) targetContextMenu: ContextMenuComponent<any>
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly layout = inject(LayoutService)
  protected readonly icons = {
    faLink,
    faArrowRotateRight,
    faArrowDown,
    faArrowUp,
    faMapMarkerAlt,
    faPen,
    faEllipsisH,
    faClock,
    faLock,
    faClipboard,
    faClipboardCheck,
    faCircleInfo
  }
  protected readonly originalOrderKeyValue = originalOrderKeyValue
  protected readonly TAB_MENU = TAB_MENU
  protected loading = false
  protected linkWasCopied = false
  protected galleryMode: ViewMode
  protected shares: ShareLinkModel[] = []
  protected selected: ShareLinkModel = null
  // Sort
  protected tableHeaders: Record<'name' | 'link' | 'from' | 'info' | 'permissions' | 'accessed', TableHeaderConfig> = {
    name: {
      label: 'Name',
      width: 30,
      textCenter: false,
      class: '',
      show: true,
      sortable: true
    },
    link: {
      label: 'Link',
      width: 15,
      textCenter: false,
      class: 'd-none d-sm-table-cell',
      show: true,
      sortable: true
    },
    from: {
      label: 'Shared from',
      width: 15,
      textCenter: false,
      class: 'd-none d-md-table-cell',
      show: true
    },
    info: { label: 'Info', width: 15, textCenter: true, class: 'd-none d-lg-table-cell', show: true, sortable: true },
    permissions: {
      label: 'Permissions',
      width: 10,
      textCenter: true,
      class: 'd-none d-lg-table-cell',
      show: true,
      sortable: true
    },
    accessed: {
      label: 'Accessed',
      width: 10,
      textCenter: true,
      class: 'd-none d-lg-table-cell',
      newly: 'newly',
      show: true,
      sortable: true
    }
  }
  protected btnSortFields = { name: 'Name', link: 'Link', accessed: 'Accessed' }
  private readonly activatedRoute = inject(ActivatedRoute)
  private readonly store = inject(StoreService)
  private readonly linksService = inject(LinksService)
  private readonly sharesService = inject(SharesService)
  private focusOnSelect: string
  private readonly sortSettings: SortSettings = {
    default: [{ prop: 'name', type: 'string' }],
    link: [{ prop: 'link.name', type: 'string' }],
    name: [{ prop: 'name', type: 'string' }],
    info: [{ prop: 'link.nbAccess', type: 'number' }],
    permissions: [{ prop: 'link.permissions', type: 'length' }],
    accessed: [{ prop: 'link.currentAccess', type: 'date' }]
  }
  protected sortTable = new SortTable(this.constructor.name, this.sortSettings)

  constructor() {
    this.loadShareLinks()
    this.activatedRoute.queryParams.subscribe((params) => (this.focusOnSelect = params.select))
    this.layout.setBreadcrumbIcon(this.icons.faLink)
    this.layout.setBreadcrumbNav({ url: `/${SPACES_PATH.LINKS}/${SPACES_TITLE.SHARED_BY_LINKS}`, translating: true, sameLink: true })
  }

  ngOnInit() {
    this.galleryMode = this.btnNavigationView.currentView()
  }

  loadShareLinks() {
    this.loading = true
    this.onSelect()
    this.linksService.shareLinksList().subscribe({
      next: (shares: ShareLinkModel[]) => {
        this.sortBy(this.sortTable.sortParam.column, false, shares)
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
        this.layout.sendNotification('error', 'Links', e.error.message)
      }
    })
  }

  sortBy(column: string, toUpdate = true, collection?: ShareLinkModel[]) {
    this.shares = this.sortTable.sortBy(column, toUpdate, collection || this.shares)
  }

  onSelect(share: ShareLinkModel = null) {
    this.selected = share
    this.store.linkSelection.set(this.selected)
  }

  openLinkDialog() {
    this.linksService.shareLink(this.selected.id).subscribe((share: ShareLinkModel) => {
      const modalRef: BsModalRef<LinkDialogComponent> = this.layout.openDialog(LinkDialogComponent, 'md', {
        initialState: { share: share } as LinkDialogComponent
      })
      modalRef.content.shareChange.pipe(take(1)).subscribe((r: ['update' | 'delete', ShareLinkModel] | ['add', ShareModel]) => {
        const [action, s] = r
        if (action === 'update') {
          this.selected = Object.assign(this.selected, s)
        } else if (action === 'delete') {
          this.onSelect()
          this.sortBy(
            this.sortTable.sortParam.column,
            false,
            this.shares.filter((share: ShareLinkModel) => share.id !== s.id)
          )
        }
      })
    })
  }

  onContextMenu(ev: any) {
    ev.preventDefault()
    ev.stopPropagation()
    this.layout.openContextMenu(ev, this.mainContextMenu)
  }

  onTargetContextMenu(ev: any, share: ShareLinkModel) {
    ev.preventDefault()
    if (ev.type === 'contextmenu') {
      ev.stopPropagation()
    }
    this.onSelect(share)
    this.layout.openContextMenu(ev, this.targetContextMenu)
  }

  copyToClipboard() {
    if (this.selected) {
      this.linksService.copyLinkToClipboard(this.selected.link.uuid)
      this.linkWasCopied = true
      this.layout.sendNotification('info', 'Link copied', this.selected.file.name || this.selected.name)
      setTimeout(() => (this.linkWasCopied = false), 3000)
    }
  }

  goTo(share?: ShareLinkModel) {
    share = share || this.selected
    this.sharesService.goTo(share).catch(console.error)
  }

  private focusOn(select: string) {
    const s = this.shares.find((share) => share.name === select)
    if (s) {
      setTimeout(() => this.scrollView.scrollInto(s), 100)
      this.onSelect(s)
    }
  }
}
