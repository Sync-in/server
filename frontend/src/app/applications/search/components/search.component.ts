/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpErrorResponse } from '@angular/common/http'
import { Component, computed, inject, Signal, ViewChild } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { Router } from '@angular/router'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faFont, faSpinner, faTimes, faTrashCan } from '@fortawesome/free-solid-svg-icons'
import { minCharsToSearch } from '@sync-in-server/backend/src/applications/files/constants/indexing'
import type { SearchFilesDto } from '@sync-in-server/backend/src/applications/files/dto/file-operations.dto'
import { L10N_LOCALE, L10nLocale, L10nTranslatePipe } from 'angular-l10n'
import { ButtonCheckboxDirective } from 'ngx-bootstrap/buttons'
import { TooltipDirective } from 'ngx-bootstrap/tooltip'
import { FilterComponent } from '../../../common/components/filter.component'
import { AutofocusDirective } from '../../../common/directives/auto-focus.directive'
import { AutoResizeDirective } from '../../../common/directives/auto-resize.directive'
import { TapDirective } from '../../../common/directives/tap.directive'
import { SearchFilterPipe } from '../../../common/pipes/search.pipe'
import { LayoutService } from '../../../layout/layout.service'
import { StoreService } from '../../../store/store.service'
import { FileContentModel } from '../../files/models/file-content.model'
import { FilesService } from '../../files/services/files.service'
import { SPACES_PATH } from '../../spaces/spaces.constants'
import { SEARCH_ICON, SEARCH_PATH } from '../search.constants'

@Component({
  selector: 'app-files-search',
  imports: [
    FilterComponent,
    FaIconComponent,
    L10nTranslatePipe,
    AutofocusDirective,
    ButtonCheckboxDirective,
    FormsModule,
    AutoResizeDirective,
    TooltipDirective,
    SearchFilterPipe,
    TapDirective
  ],
  templateUrl: './search.component.html'
})
export class SearchComponent {
  @ViewChild(FilterComponent, { static: true }) inputFilter: FilterComponent
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly store = inject(StoreService)
  public searchContent: Signal<string> = computed(() => this.store.currentSearch().content)
  protected readonly icons = { SEARCH_ICON, faSpinner, faTrashCan, faTimes, faFont }
  protected minCharsToSearch = minCharsToSearch
  protected loading = false
  protected errorMessage: string = null
  protected selectedId: number = null
  private readonly router = inject(Router)
  private readonly layout = inject(LayoutService)
  private readonly filesService = inject(FilesService)

  constructor() {
    this.layout.setBreadcrumbIcon(SEARCH_ICON)
    this.layout.setBreadcrumbNav({ url: `/${SEARCH_PATH.BASE}`, translating: false, sameLink: true })
  }

  setCurrentSearch(event: any) {
    this.store.currentSearch.update((s: SearchFilesDto) => ({ ...s, content: event.target.value }))
  }

  doSearch() {
    if (this.searchContent().length < this.minCharsToSearch) {
      return
    }
    this.errorMessage = null
    this.loading = true
    this.selectedId = null
    this.filesService.search(this.store.currentSearch()).subscribe({
      next: (fs: FileContentModel[]) => {
        this.store.filesSearch.set(fs)
        this.loading = false
      },
      error: (e: HttpErrorResponse) => {
        this.store.filesSearch.set([])
        this.errorMessage = e.error.message
        this.loading = false
      }
    })
  }

  toggleFullText() {
    this.store.currentSearch.update((s: SearchFilesDto) => ({ ...s, fullText: !s.fullText }))
  }

  clearSearch() {
    this.store.currentSearch.update((s: SearchFilesDto) => ({ ...s, content: '' }))
    this.store.filesSearch.set([])
  }

  goTo(f: FileContentModel) {
    this.router.navigate([SPACES_PATH.SPACES, ...f.path.split('/')], { queryParams: { select: f.name } }).catch(console.error)
  }
}
