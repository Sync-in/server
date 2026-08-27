import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnDestroy } from '@angular/core'
import { Router } from '@angular/router'
import type { LucideIcon } from '@lucide/angular'
import {
  LucideBan,
  LucideCheck,
  LucideCircleAlert,
  LucideClock,
  LucideCopy,
  LucideDynamicIcon,
  LucideFile,
  LucideFileArchive,
  LucideFileDown,
  LucideFlag,
  LucideFolderClosed,
  LucideGlobe,
  LucideLoader,
  LucideMove,
  LucideSquareStop,
  LucideTrash2,
  LucideX
} from '@lucide/angular'
import { FILE_OPERATION } from '@sync-in-server/backend/src/applications/files/constants/operations'
import { FileTask, FileTaskStatus } from '@sync-in-server/backend/src/applications/files/models/file-task'
import { L10N_LOCALE, L10nLocale, L10nTranslatePipe } from 'angular-l10n'
import { ProgressbarComponent } from 'ngx-bootstrap/progressbar'
import { TooltipModule } from 'ngx-bootstrap/tooltip'
import { Subscription } from 'rxjs'
import { AutoResizeDirective } from '../../../../common/directives/auto-resize.directive'
import { ToBytesPipe } from '../../../../common/pipes/to-bytes.pipe'
import { StoreService } from '../../../../store/store.service'
import { SPACES_PATH } from '../../../spaces/spaces.constants'
import type { FileTaskView, TaskProgressItem } from '../../interfaces/file-task-view.interface'
import { FilesTasksService } from '../../services/files-tasks.service'
import { FilesService } from '../../services/files.service'
import { TimeAgoPipe } from '../../../../common/pipes/time-ago.pipe'

@Component({
  selector: 'app-files-tasks',
  imports: [LucideDynamicIcon, L10nTranslatePipe, AutoResizeDirective, TooltipModule, ProgressbarComponent, ToBytesPipe, TimeAgoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: 'files-tasks.component.html'
})
export class FilesTasksComponent implements OnDestroy {
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly icons = { LucideX, LucideFlag, LucideClock, LucideFile, LucideFolderClosed, LucideSquareStop }
  protected readonly iconsStatus: Record<FileTaskStatus, LucideIcon> = {
    [FileTaskStatus.PENDING]: LucideLoader,
    [FileTaskStatus.SUCCESS]: LucideCheck,
    [FileTaskStatus.ERROR]: LucideCircleAlert,
    [FileTaskStatus.CANCELLED]: LucideBan,
    [FileTaskStatus.QUEUED]: LucideClock
  }
  protected readonly iconsOperation: Partial<Record<FILE_OPERATION, LucideIcon>> = {
    [FILE_OPERATION.DELETE]: LucideTrash2,
    [FILE_OPERATION.MOVE]: LucideMove,
    [FILE_OPERATION.COPY]: LucideCopy,
    [FILE_OPERATION.DOWNLOAD]: LucideGlobe,
    [FILE_OPERATION.UPLOAD]: LucideFileDown,
    [FILE_OPERATION.COMPRESS]: LucideFileArchive,
    [FILE_OPERATION.DECOMPRESS]: LucideFileArchive
  } as const
  protected nbActiveTasks = 0
  protected nbEndedTasks = 0
  protected nbTotalTasks = 0
  protected hasCancellableTasks = false
  protected tasks: FileTaskView[] = []
  private readonly router = inject(Router)
  private readonly store = inject(StoreService)
  private readonly filesService = inject(FilesService)
  private readonly filesTasksService = inject(FilesTasksService)
  private readonly cdr = inject(ChangeDetectorRef)
  private subscriptions: Subscription[] = []

  constructor() {
    this.subscriptions.push(this.store.filesActiveTasks.subscribe((tasks: FileTask[]) => this.updateTasks(tasks, true)))
    this.subscriptions.push(this.store.filesEndedTasks.subscribe((tasks: FileTask[]) => this.updateTasks(tasks, false)))
  }

  ngOnDestroy() {
    this.subscriptions.forEach((s) => s.unsubscribe())
  }

  updateTasks(tasks: FileTask[], active = false) {
    if (active) {
      this.tasks = this.sortTasksForDisplay([...tasks, ...this.store.filesEndedTasks.getValue()])
      this.nbActiveTasks = tasks.length
      this.nbEndedTasks = this.store.filesEndedTasks.getValue().length
    } else {
      this.tasks = this.sortTasksForDisplay([...this.store.filesActiveTasks.getValue(), ...tasks])
      this.nbEndedTasks = tasks.length
      this.nbActiveTasks = this.store.filesActiveTasks.getValue().length
    }
    this.nbTotalTasks = this.nbActiveTasks + this.nbEndedTasks
    this.updateHasCancellableTasks()
    this.cdr.markForCheck()
  }

  removeTasks() {
    this.filesTasksService.removeAll()
  }

  cancelTasks() {
    for (const task of this.tasks) {
      if (task.ui.cancellable) {
        this.filesTasksService.cancel(task)
        task.ui.cancellable = false
      }
    }
    this.updateHasCancellableTasks()
  }

  cancelTask(event: MouseEvent, task: FileTaskView) {
    event.stopPropagation()
    if (!task.ui.cancellable) return
    this.filesTasksService.cancel(task)
    task.ui.cancellable = false
    this.updateHasCancellableTasks()
  }

  openTask(task: FileTask) {
    if (task.status !== FileTaskStatus.SUCCESS) return
    if (task.type === FILE_OPERATION.COMPRESS && task.props.compressInDirectory === false) {
      this.filesService.downloadTaskArchive(task.id)
      return
    } else if (task.type === FILE_OPERATION.DELETE) {
      if (task.path.startsWith(SPACES_PATH.FILES)) {
        task.path = task.path.replace(SPACES_PATH.FILES, SPACES_PATH.TRASH)
      } else if (task.path.startsWith(SPACES_PATH.SHARES)) {
        // cannot access to the space referenced by the share
        return
      }
    }
    this.router.navigate([`${SPACES_PATH.SPACES}/${task.path}`], { queryParams: { select: task.name } }).catch(console.error)
  }

  private sortTasksForDisplay(tasks: FileTask[]): FileTaskView[] {
    return tasks
      .map((task: FileTask, index: number) => ({ index, task: this.createTaskView(task) }))
      .sort((a, b) => a.task.ui.displayPriority - b.task.ui.displayPriority || a.index - b.index)
      .map(({ task }) => task)
  }

  private createTaskView(task: FileTask): FileTaskView {
    const pending = task.status === FileTaskStatus.PENDING
    const queued = task.status === FileTaskStatus.QUEUED
    const error = task.status === FileTaskStatus.ERROR
    const cancelled = task.status === FileTaskStatus.CANCELLED
    return {
      ...task,
      ui: {
        cancelled,
        cancellable: this.filesTasksService.canCancel(task),
        displayPriority: pending ? 0 : queued ? 1 : 2,
        error,
        openable: task.status === FileTaskStatus.SUCCESS,
        operationIcon: this.iconsOperation[task.type] || this.icons.LucideFlag,
        pending,
        progress: pending ? task.props.progress || 100 : queued ? 0 : 100,
        progressItems: this.createProgressItems(task, pending, queued),
        progressType: pending ? 'warning' : error ? 'danger' : null,
        queued,
        statusIcon: this.iconsStatus[task.status]
      }
    }
  }

  private createProgressItems(task: FileTask, pending: boolean, queued: boolean): TaskProgressItem[] {
    const items: TaskProgressItem[] = []
    if (pending && task.props.totalSize) {
      items.push({ type: 'currentSize', value: task.props.size ?? 0 }, { type: 'totalSize', value: task.props.totalSize })
    } else if (pending && task.type === FILE_OPERATION.COMPRESS) {
      items.push({ type: 'currentSize', value: task.props.size ?? 0 })
    } else {
      const size = queued ? task.props.totalSize || task.props.size : task.props.size || task.props.totalSize
      if (size) {
        items.push({ type: 'size', value: size })
      }
    }
    if (task.props.directories) {
      items.push({ icon: this.icons.LucideFolderClosed, type: 'directories', value: task.props.directories })
    }
    if (task.props.files) {
      items.push({ icon: this.icons.LucideFile, type: 'files', value: task.props.files })
    }
    if (!pending && !queued && task.endedAt) {
      items.push({ icon: this.icons.LucideClock, type: 'endedAt', value: task.endedAt })
    }
    return items
  }

  private updateHasCancellableTasks() {
    this.hasCancellableTasks = this.tasks.some((task: FileTaskView) => task.ui.cancellable)
  }
}
