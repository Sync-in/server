import { DatePipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { Router } from '@angular/router'
import { LucideDynamicIcon, LucideFileText, LucideMessageSquareMore } from '@lucide/angular'
import { L10N_LOCALE, L10nDatePipe, type L10nLocale, L10nTranslateDirective } from 'angular-l10n'
import { AutoResizeDirective } from '../../../common/directives/auto-resize.directive'
import { LiveTimeAgoPipe } from '../../../common/pipes/time-ago-live.pipe'
import { dJs } from '../../../common/utils/time'
import { TAB_MENU } from '../../../layout/layout.interfaces'
import { LayoutService } from '../../../layout/layout.service'
import { StoreService } from '../../../store/store.service'
import { CommentsService } from '../../comments/services/comments.service'
import { FileLocationComponent } from '../../files/components/utils/file-location.component'
import { FilesService } from '../../files/services/files.service'
import { SPACES_PATH } from '../../spaces/spaces.constants'
import { UserAvatarComponent } from '../../users/components/utils/user-avatar.component'
import type { RecentsTimelineFilter, RecentsTimelineGroup, RecentsTimelineItem } from '../interfaces/recents-timeline.interface'
import { RECENTS_ICON, RECENTS_PATH, RECENTS_TITLE } from '../recents.constants'

@Component({
  selector: 'app-recents',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AutoResizeDirective,
    DatePipe,
    FileLocationComponent,
    L10nDatePipe,
    L10nTranslateDirective,
    LiveTimeAgoPipe,
    LucideDynamicIcon,
    UserAvatarComponent
  ],
  templateUrl: './recents.component.html'
})
export class RecentsComponent {
  protected readonly icons = { LucideFileText, LucideMessageSquareMore }
  protected readonly activeFilter = signal<RecentsTimelineFilter>('all')
  private readonly router = inject(Router)
  private readonly layout = inject(LayoutService)
  private readonly store = inject(StoreService)
  private readonly filesService = inject(FilesService)
  private readonly commentsService = inject(CommentsService)
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)

  protected readonly groups = computed<RecentsTimelineGroup[]>(() => {
    const activeFilter = this.activeFilter()
    const today = dJs().startOf('day')
    const yesterday = today.subtract(1, 'day')
    const weekStart = today.startOf('week')
    const items: RecentsTimelineItem[] = [
      ...this.store.filesRecents().map((file) => ({ key: `file-${file.id}`, kind: 'file' as const, timestamp: dJs(file.mtime).valueOf(), file })),
      ...this.store
        .commentsRecents()
        .map((comment) => ({ key: `comment-${comment.id}`, kind: 'comment' as const, timestamp: dJs(comment.modifiedAt).valueOf(), comment }))
    ]
      .filter((item) => Number.isFinite(item.timestamp))
      .filter((item) => activeFilter === 'all' || item.kind === activeFilter)
      .sort((a, b) => b.timestamp - a.timestamp || a.key.localeCompare(b.key))

    const groups = new Map<string, RecentsTimelineGroup>()
    for (const item of items) {
      const day = dJs(item.timestamp).startOf('day')
      let key: string
      let period: RecentsTimelineGroup['period']
      let startDate: number
      let endDate: number

      if (day.isSame(today, 'day')) {
        key = 'today'
        period = 'today'
        startDate = today.valueOf()
        endDate = today.valueOf()
      } else if (day.isSame(yesterday, 'day')) {
        key = 'yesterday'
        period = 'yesterday'
        startDate = yesterday.valueOf()
        endDate = yesterday.valueOf()
      } else if (!day.isBefore(weekStart, 'day')) {
        key = 'week'
        period = 'week'
        startDate = weekStart.valueOf()
        endDate = today.valueOf()
      } else {
        const month = day.startOf('month')
        key = `older-${month.format('YYYY-MM')}`
        period = 'older'
        startDate = month.valueOf()
        endDate = month.endOf('month').valueOf()
      }

      const group = groups.get(key)
      if (group) {
        group.items.push(item)
      } else {
        groups.set(key, { key, date: item.timestamp, startDate, endDate, period, items: [item] })
      }
    }
    return [...groups.values()]
  })

  constructor() {
    this.layout.setBreadcrumbIcon(RECENTS_ICON)
    this.layout.setBreadcrumbNav({ url: `/${RECENTS_PATH.BASE}/${RECENTS_TITLE}`, translating: true, sameLink: true })
    this.filesService.loadRecents()
    this.commentsService.loadRecents()
  }

  protected goToItem(item: RecentsTimelineItem) {
    const target = item.kind === 'file' ? item.file : item.comment.file
    this.router
      .navigate([SPACES_PATH.SPACES, ...target.path.split('/')], { queryParams: { select: target.name } })
      .then((navigated) => {
        if (navigated && item.kind === 'comment') this.layout.showRSideBarTab(TAB_MENU.COMMENTS, true)
      })
      .catch(console.error)
  }
}
