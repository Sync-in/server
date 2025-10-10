/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { KeyValuePipe } from '@angular/common'
import { Component, ElementRef, inject, OnInit, ViewChild } from '@angular/core'
import { Router } from '@angular/router'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faArrowDown, faArrowRotateRight, faArrowUp, faCircleInfo } from '@fortawesome/free-solid-svg-icons'
import { ContextMenuComponent, ContextMenuModule } from '@perfectmemory/ngx-contextmenu'
import type { SpaceTrash } from '@sync-in-server/backend/src/applications/spaces/interfaces/space-trash.interface'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { TooltipModule } from 'ngx-bootstrap/tooltip'
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
import { TrashModel } from '../models/trash.model'
import { SpacesService } from '../services/spaces.service'
import { SPACES_ICON, SPACES_PATH, SPACES_TITLE } from '../spaces.constants'

@Component({
  selector: 'app-spaces-trash',
  imports: [
    FaIconComponent,
    NavigationViewComponent,
    L10nTranslatePipe,
    FilterComponent,
    TooltipModule,
    KeyValuePipe,
    VirtualScrollComponent,
    SearchFilterPipe,
    L10nTranslateDirective,
    ContextMenuModule,
    TapDirective
  ],
  templateUrl: 'trash.component.html'
})
export class TrashComponent implements OnInit {
  @ViewChild(VirtualScrollComponent) scrollView: { element: ElementRef; viewPortItems: TrashModel[]; scrollInto: (arg: TrashModel | number) => void }
  @ViewChild(FilterComponent, { static: true }) inputFilter: FilterComponent
  @ViewChild(NavigationViewComponent, { static: true }) btnNavigationView: NavigationViewComponent
  @ViewChild('MainContextMenu', { static: true }) mainContextMenu: ContextMenuComponent<any>
  @ViewChild('TargetContextMenu', { static: true }) targetContextMenu: ContextMenuComponent<any>
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly layout = inject(LayoutService)
  protected readonly originalOrderKeyValue = originalOrderKeyValue
  protected readonly icons = { SPACES: SPACES_ICON.SPACES, PERSONAL: SPACES_ICON.PERSONAL, faArrowDown, faArrowUp, faArrowRotateRight, faCircleInfo }
  protected readonly TAB_MENU = TAB_MENU
  protected galleryMode: ViewMode
  protected loading = false
  protected selected: TrashModel = null
  protected trashBins: TrashModel[] = []
  // Sort
  protected tableHeaders: Record<'name' | 'nb' | 'modified', TableHeaderConfig> = {
    name: {
      label: 'Space',
      width: 50,
      textCenter: false,
      class: '',
      show: true,
      sortable: true
    },
    nb: {
      label: 'Elements',
      width: 10,
      textCenter: true,
      class: '',
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
  protected btnSortFields = { name: 'Name', nb: 'Elements', mtime: 'Modified' }
  private readonly router = inject(Router)
  private readonly store = inject(StoreService)
  private readonly spacesService = inject(SpacesService)
  private readonly sortSettings: SortSettings = {
    default: [
      { prop: 'isPersonal', type: 'number' },
      { prop: 'name', type: 'string' }
    ],
    name: [{ prop: 'name', type: 'string' }],
    nb: [{ prop: 'nb', type: 'number' }],
    modified: [{ prop: 'mtime', type: 'date' }]
  }
  protected sortTable = new SortTable(this.constructor.name, this.sortSettings)

  constructor() {
    this.loadTrashBins()
    this.layout.setBreadcrumbIcon(SPACES_ICON.TRASH)
    this.layout.setBreadcrumbNav({ url: `/${SPACES_PATH.TRASH}/${SPACES_TITLE.TRASH}`, translating: true, sameLink: true })
  }

  ngOnInit() {
    this.galleryMode = this.btnNavigationView.currentView()
  }

  loadTrashBins() {
    this.loading = true
    this.onSelect()
    this.spacesService.listTrashBins().subscribe({
      next: (trashBins: SpaceTrash[]) => {
        this.sortBy(
          this.sortTable.sortParam.column,
          false,
          trashBins.map((t: SpaceTrash) => new TrashModel(t))
        )
        this.loading = false
      }
    })
  }

  onSelect(trash: TrashModel = null) {
    this.selected = trash
    this.store.trashSelection.set(this.selected)
  }

  sortBy(column: string, toUpdate = true, collection?: TrashModel[]) {
    this.trashBins = this.sortTable.sortBy(column, toUpdate, collection || this.trashBins)
  }

  onContextMenu(ev: MouseEvent) {
    ev.preventDefault()
    ev.stopPropagation()
    this.layout.openContextMenu(ev, this.mainContextMenu)
  }

  onTargetContextMenu(ev: any, trash: TrashModel) {
    ev.preventDefault()
    if (ev.type === 'contextmenu') {
      ev.stopPropagation()
    }
    this.onSelect(trash)
    this.layout.openContextMenu(ev, this.targetContextMenu)
  }

  browse(trash: TrashModel) {
    this.router.navigate([SPACES_PATH.SPACES_TRASH, trash.alias]).catch(console.error)
  }
}
