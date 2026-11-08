import { KeyValuePipe } from '@angular/common'
import { HttpErrorResponse } from '@angular/common/http'
import { Component, inject, OnInit, signal, ViewChild, viewChild } from '@angular/core'
import { ActivatedRoute } from '@angular/router'
import {
  LucideArrowDown,
  LucideArrowUp,
  LucideClipboard,
  LucideClipboardCheck,
  LucideClock,
  LucideDynamicIcon,
  LucideEllipsis,
  LucideLink,
  LucideLock,
  LucideMapPin,
  LucidePencil,
  LucideRotateCw
} from '@lucide/angular'
import { ContextMenuComponent, ContextMenuModule } from '@perfectmemory/ngx-contextmenu'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { BsModalRef } from 'ngx-bootstrap/modal'
import { TooltipModule } from 'ngx-bootstrap/tooltip'
import { take } from 'rxjs/operators'
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
import { ShareRepositoryComponent } from '../../shares/components/utils/share-repository.component'
import { ShareModel } from '../../shares/models/share.model'
import { SharesService } from '../../shares/services/shares.service'
import { SPACES_ICON, SPACES_PATH, SPACES_TITLE } from '../../spaces/spaces.constants'
import { ShareLinkModel } from '../models/share-link.model'
import { LinksService } from '../services/links.service'
import { LinkDialogComponent } from './dialogs/link-dialog.component'

@Component({
  selector: 'app-shared-links',
  imports: [
    ContextMenuModule,
    LucideDynamicIcon,
    KeyValuePipe,
    L10nTranslateDirective,
    L10nTranslatePipe,
    NavigationViewComponent,
    TooltipModule,
    VirtualScrollComponent,
    SearchFilterPipe,
    ShareRepositoryComponent,
    BadgePermissionsComponent,
    TapDirective
  ],
  templateUrl: 'links.component.html'
})
export class LinksComponent implements OnInit {
  protected readonly scrollView = viewChild<VirtualScrollComponent<ShareLinkModel>>(VirtualScrollComponent)
  @ViewChild(NavigationViewComponent, { static: true }) btnNavigationView: NavigationViewComponent
  readonly mainContextMenu = viewChild.required<ContextMenuComponent<any>>('MainContextMenu')
  readonly targetContextMenu = viewChild.required<ContextMenuComponent<any>>('TargetContextMenu')
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly layout = inject(LayoutService)
  protected readonly navbarSearch = inject(NavbarSearchService)
  protected readonly icons = {
    LucideLink,
    LucideRotateCw,
    LucideArrowDown,
    LucideArrowUp,
    LucideMapPin,
    LucidePencil,
    LucideEllipsis,
    LucideClock,
    LucideLock,
    LucideClipboard,
    LucideClipboardCheck,
    SELECTION: SPACES_ICON.SELECTION
  }
  protected readonly originalOrderKeyValue = originalOrderKeyValue
  protected readonly TAB_MENU = TAB_MENU
  protected readonly galleryMode = signal<ViewMode>(undefined)
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
      width: 12,
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
  private readonly activatedRoute = inject(ActivatedRoute)
  protected readonly loading = signal(false)
  protected readonly linkWasCopied = signal(false)
  protected readonly shares = signal<ShareLinkModel[]>([])
  protected readonly selected = signal<ShareLinkModel>(null)
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
    this.layout.setBreadcrumbIcon(this.icons.LucideLink)
    this.layout.setBreadcrumbNav({ url: `/${SPACES_PATH.LINKS}/${SPACES_TITLE.SHARED_BY_LINKS}`, translating: true, sameLink: true })
  }

  ngOnInit() {
    this.galleryMode.set(this.btnNavigationView.currentView())
  }

  loadShareLinks() {
    this.loading.set(true)
    this.onSelect()
    this.linksService.shareLinksList().subscribe({
      next: (shares: ShareLinkModel[]) => {
        this.sortBy(this.sortTable.sortParam.column, false, shares)
        this.loading.set(false)
        if (this.focusOnSelect) {
          this.focusOn(this.focusOnSelect)
        } else {
          this.scrollView()?.scrollInto(-1)
        }
      },
      error: (e: HttpErrorResponse) => {
        this.shares.set([])
        this.loading.set(false)
        this.layout.sendNotification('error', 'Links', e.error.message)
      }
    })
  }

  sortBy(column: string, toUpdate = true, collection?: ShareLinkModel[]) {
    this.shares.set(this.sortTable.sortBy(column, toUpdate, collection || this.shares()))
  }

  onSelect(share: ShareLinkModel = null) {
    this.selected.set(share)
    this.store.linkSelection.set(this.selected())
  }

  onLinkActivate(share: ShareLinkModel) {
    this.onSelect(share)
    this.openLinkDialog()
  }

  openLinkDialog() {
    this.linksService.shareLink(this.selected().id).subscribe((share: ShareLinkModel) => {
      const modalRef: BsModalRef<LinkDialogComponent> = this.layout.openDialog(LinkDialogComponent, 'lg', {
        initialState: { share: share } as LinkDialogComponent
      })
      modalRef.content.shareChange.pipe(take(1)).subscribe((r: ['update' | 'delete', ShareLinkModel] | ['add', ShareModel]) => {
        const [action, s] = r
        if (action === 'update') {
          Object.assign(this.selected(), s)
          this.notifyLinkMutation(this.selected()!)
        } else if (action === 'delete') {
          this.onSelect()
          this.sortBy(
            this.sortTable.sortParam.column,
            false,
            this.shares().filter((item: ShareLinkModel) => item.id !== s.id)
          )
        }
      })
    })
  }

  onContextMenu(ev: any) {
    ev.preventDefault()
    ev.stopPropagation()
    this.layout.openContextMenu(ev, this.mainContextMenu())
  }

  onTargetContextMenu(ev: any, share: ShareLinkModel) {
    ev.preventDefault()
    if (ev.type === 'contextmenu') {
      ev.stopPropagation()
    }
    this.onSelect(share)
    this.layout.openContextMenu(ev, this.targetContextMenu())
  }

  copyToClipboard() {
    if (this.selected()) {
      this.linksService.copyLinkToClipboard(this.selected().link.uuid)
      this.linkWasCopied.set(true)
      this.layout.sendNotification('info', 'Link copied', this.selected().file.name || this.selected().name)
      setTimeout(() => this.linkWasCopied.set(false), 3000)
    }
  }

  goTo(share?: ShareLinkModel) {
    share = share || this.selected()
    this.sharesService.goTo(share).catch(console.error)
  }

  private focusOn(select: string) {
    const share = this.shares().find((item) => item.name === select)
    if (share) {
      setTimeout(() => this.scrollView()?.scrollInto(share), 100)
      this.onSelect(share)
    }
  }

  private notifyLinkMutation(link: ShareLinkModel) {
    this.shares.update((shares) => [...shares])
    if (this.selected() === link) {
      this.store.linkSelection.set(link)
    }
  }
}
