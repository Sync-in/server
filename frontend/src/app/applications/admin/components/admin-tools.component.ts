import { Component, inject, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { LucideDynamicIcon, LucidePlay, LucideSquare, LucideTrash } from '@lucide/angular'
import { L10nTranslateDirective } from 'angular-l10n'
import { AutoResizeDirective } from '../../../common/directives/auto-resize.directive'
import { ADMIN_ICON, ADMIN_PATH, ADMIN_TITLE } from '../admin.constants'
import { LayoutService } from '../../../layout/layout.service'
import { AdminService } from '../admin.service'
import { switchMap, timer } from 'rxjs'
import { IndexingState, IndexingStatus } from '@sync-in-server/backend/src/applications/files/interfaces/indexing.interface'
import { TimeDateFormatPipe } from '../../../common/pipes/time-date-format.pipe'

@Component({
  selector: 'app-admin-tools',
  imports: [AutoResizeDirective, L10nTranslateDirective, LucideDynamicIcon, TimeDateFormatPipe],
  templateUrl: 'admin-tools.component.html'
})
export class AdminToolsComponent {
  protected readonly icons = { LucideTrash, LucidePlay, LucideSquare }
  protected readonly IndexingState = IndexingState
  protected readonly confirmResetIndexing = signal(false)
  protected readonly indexingStatus = signal<IndexingStatus>({
    indexesCount: 0,
    state: this.IndexingState.IDLE,
    lastFullRunAt: null,
    lastPartialRunAt: null
  })
  private readonly adminService = inject(AdminService)
  private readonly layout = inject(LayoutService)
  constructor() {
    timer(0, 6_000)
      .pipe(
        switchMap(() => this.adminService.indexingStatus()),
        takeUntilDestroyed()
      )
      .subscribe((r: IndexingStatus) => {
        this.indexingStatus.set({ ...r })
      })
    this.layout.setBreadcrumbIcon(ADMIN_ICON.TOOLS)
    this.layout.setBreadcrumbNav({
      url: `/${ADMIN_PATH.BASE}/${ADMIN_PATH.TOOLS}/${ADMIN_TITLE.TOOLS}`,
      splicing: 2,
      translating: true,
      sameLink: true
    })
  }

  startIndexing() {
    this.adminService.startIndexing().subscribe((pending) => {
      if (pending) this.indexingStatus.update((status) => ({ ...status, state: IndexingState.PENDING }))
    })
  }

  stopIndexing() {
    this.adminService.stopIndexing().subscribe((stopping) => {
      if (stopping) this.indexingStatus.update((status) => ({ ...status, state: IndexingState.STOPPING }))
    })
  }

  dropIndexes() {
    if (!this.confirmResetIndexing()) {
      this.confirmResetIndexing.set(true)
      return
    }
    this.adminService.dropIndexes().subscribe(() => {
      this.indexingStatus.update((status) => ({ ...status, indexesCount: 0 }))
      this.confirmResetIndexing.set(false)
    })
  }
}
