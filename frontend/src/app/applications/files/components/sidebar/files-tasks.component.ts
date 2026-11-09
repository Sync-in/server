import { Component, computed, inject } from '@angular/core'
import { Router } from '@angular/router'
import type { LucideIcon } from '@lucide/angular'
import {
  LucideBan,
  LucideCheck,
  LucideCircleExclamationPoint,
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
  LucideOctagonX,
  LucideTrash,
  LucideX
} from '@lucide/angular'
import { FILE_OPERATION } from '@sync-in-server/backend/src/applications/files/constants/operations'
import { FileTask, FileTaskStatus } from '@sync-in-server/backend/src/applications/files/models/file-task'
import { L10N_LOCALE, L10nLocale, L10nTranslatePipe } from 'angular-l10n'
import { ProgressbarComponent } from 'ngx-bootstrap/progressbar'
import { TooltipModule } from 'ngx-bootstrap/tooltip'
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
  templateUrl: 'files-tasks.component.html'
})
export class FilesTasksComponent {
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly icons = { LucideX, LucideFlag, LucideClock, LucideFile, LucideFolderClosed, LucideOctagonX }
  protected readonly iconsStatus: Record<FileTaskStatus, LucideIcon> = {
    [FileTaskStatus.PENDING]: LucideLoader,
    [FileTaskStatus.SUCCESS]: LucideCheck,
    [FileTaskStatus.ERROR]: LucideCircleExclamationPoint,
    [FileTaskStatus.CANCELLED]: LucideBan,
    [FileTaskStatus.QUEUED]: LucideClock
  }
  protected readonly iconsOperation: Partial<Record<FILE_OPERATION, LucideIcon>> = {
    [FILE_OPERATION.DELETE]: LucideTrash,
    [FILE_OPERATION.MOVE]: LucideMove,
    [FILE_OPERATION.COPY]: LucideCopy,
    [FILE_OPERATION.DOWNLOAD]: LucideGlobe,
    [FILE_OPERATION.UPLOAD]: LucideFileDown,
    [FILE_OPERATION.COMPRESS]: LucideFileArchive,
    [FILE_OPERATION.DECOMPRESS]: LucideFileArchive
  } as const
  private readonly router = inject(Router)
  private readonly store = inject(StoreService)
  private readonly filesService = inject(FilesService)
  private readonly filesTasksService = inject(FilesTasksService)
  private readonly activeTasks = this.store.filesActiveTasks
  private readonly endedTasks = this.store.filesEndedTasks
  protected readonly nbActiveTasks = computed(() => this.activeTasks().length)
  protected readonly nbEndedTasks = computed(() => this.endedTasks().length)
  protected readonly nbTotalTasks = computed(() => this.nbActiveTasks() + this.nbEndedTasks())
  protected readonly tasks = computed(() => this.sortTasksForDisplay([...this.activeTasks(), ...this.endedTasks()]))
  protected readonly hasCancellableTasks = computed(() => this.tasks().some((task: FileTaskView) => task.ui.cancellable))

  removeTasks() {
    this.filesTasksService.removeAll()
  }

  cancelTasks() {
    for (const task of this.tasks()) {
      if (task.ui.cancellable) {
        this.filesTasksService.cancel(task)
      }
    }
  }

  cancelTask(event: MouseEvent, task: FileTaskView) {
    event.stopPropagation()
    if (!task.ui.cancellable) return
    this.filesTasksService.cancel(task)
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
}
