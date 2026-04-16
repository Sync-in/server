import { Component, DestroyRef, inject } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faPlay, faStop, faTrash } from '@fortawesome/free-solid-svg-icons'
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
  imports: [AutoResizeDirective, L10nTranslateDirective, FaIconComponent, TimeDateFormatPipe],
  templateUrl: 'admin-tools.component.html'
})
export class AdminToolsComponent {
  protected readonly icons = { faTrash, faPlay, faStop }
  protected readonly IndexingState = IndexingState
  protected confirmResetIndexing = false
  protected indexingStatus: IndexingStatus = { indexesCount: 0, state: this.IndexingState.IDLE, lastFullRunAt: null, lastPartialRunAt: null }
  private readonly adminService = inject(AdminService)
  private readonly layout = inject(LayoutService)
  private readonly destroyRef = inject(DestroyRef)

  constructor() {
    timer(0, 6_000)
      .pipe(
        switchMap(() => this.adminService.indexingStatus()),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((r: IndexingStatus) => (this.indexingStatus = { ...r }))
    this.layout.setBreadcrumbIcon(ADMIN_ICON.TOOLS)
    this.layout.setBreadcrumbNav({
      url: `/${ADMIN_PATH.BASE}/${ADMIN_PATH.TOOLS}/${ADMIN_TITLE.TOOLS}`,
      splicing: 2,
      translating: true,
      sameLink: true
    })
  }

  startIndexing() {
    this.adminService.startIndexing().subscribe((started) => {
      if (started) this.indexingStatus.state = IndexingState.RUNNING
    })
  }

  stopIndexing() {
    this.adminService.stopIndexing().subscribe((stopped) => {
      if (stopped) this.indexingStatus.state = IndexingState.STOPPING
    })
  }

  dropIndexes() {
    if (!this.confirmResetIndexing) {
      this.confirmResetIndexing = true
      return
    }
    this.adminService.dropIndexes().subscribe(() => {
      this.indexingStatus.indexesCount = 0
      this.confirmResetIndexing = false
    })
  }
}
