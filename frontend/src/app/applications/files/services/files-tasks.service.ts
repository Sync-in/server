import { HttpClient, HttpErrorResponse } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { FILE_OPERATION } from '@sync-in-server/backend/src/applications/files/constants/operations'
import { API_FILES_TASKS } from '@sync-in-server/backend/src/applications/files/constants/routes'
import { FileTask, FileTaskStatus } from '@sync-in-server/backend/src/applications/files/models/file-task'
import { SPACE_REPOSITORY } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import { currentTimeStamp } from '@sync-in-server/backend/src/common/shared'
import { Subscription, timer } from 'rxjs'
import { tap } from 'rxjs/operators'
import { genRandomUUID } from '../../../common/utils/functions'
import { escapeRegexp } from '../../../common/utils/regexp'
import { TAB_MENU } from '../../../layout/layout.interfaces'
import { LayoutService } from '../../../layout/layout.service'
import { StoreService } from '../../../store/store.service'
import { UserType } from '../../users/interfaces/user.interface'
import { FileEvent } from '../interfaces/file-event.interface'

@Injectable({ providedIn: 'root' })
export class FilesTasksService {
  private readonly http = inject(HttpClient)
  private readonly layout = inject(LayoutService)
  private readonly store = inject(StoreService)
  private readonly onDone: Partial<
    Record<
      FILE_OPERATION,
      { fileEvent: Partial<Pick<FileEvent, 'reload' | 'focus' | 'reloadFocusOnDst' | 'delete'>>; msg: { failed: string; success: string } }
    >
  > = {
    [FILE_OPERATION.DELETE]: {
      fileEvent: { delete: true },
      msg: { success: 'Deletion done', failed: 'Deletion failed' }
    },
    [FILE_OPERATION.MOVE]: {
      fileEvent: { delete: true, reloadFocusOnDst: true },
      msg: { success: 'Move done', failed: 'Move failed' }
    },
    [FILE_OPERATION.COPY]: { msg: { success: 'Copy done', failed: 'Copy failed' }, fileEvent: { reload: true, focus: true } as Partial<FileEvent> },
    [FILE_OPERATION.DOWNLOAD]: {
      fileEvent: { reload: true, focus: true },
      msg: { success: 'Download done', failed: 'Download failed' }
    },
    [FILE_OPERATION.UPLOAD]: {
      fileEvent: { reload: true, focus: true },
      msg: { success: 'Upload done', failed: 'Upload failed' }
    },
    [FILE_OPERATION.COMPRESS]: {
      fileEvent: { reload: true, focus: true },
      msg: { success: 'Compression done', failed: 'Compression failed' }
    },
    [FILE_OPERATION.DECOMPRESS]: {
      fileEvent: { reload: true, focus: true },
      msg: { success: 'Decompression done', failed: 'Decompression failed' }
    }
  }
  private currentUserId: number
  private watcher: Subscription = null
  private watch = timer(1000, 1000).pipe(tap(() => this.doWatch()))

  constructor() {
    this.store.user.subscribe((u: UserType) => {
      if (u && this.currentUserId !== u?.id) {
        // Load tasks when the user is defined and has changed to prevent interceptor redirects
        this.loadAll()
      }
      this.currentUserId = u?.id
    })
  }

  addTask(task: FileTask) {
    if (task.status === FileTaskStatus.PENDING) {
      this.store.filesActiveTasks.next([task, ...this.store.filesActiveTasks.getValue()])
      this.startWatch()
    } else {
      this.store.filesEndedTasks.next([task, ...this.store.filesEndedTasks.getValue()])
    }
  }

  createUploadTask(path: string, name: string, totalSize: number): FileTask {
    const task = new FileTask(genRandomUUID(), FILE_OPERATION.UPLOAD, path, name)
    task.status = FileTaskStatus.PENDING
    task.startedAt = currentTimeStamp(null, true)
    task.props = { progress: 1, size: 0, totalSize: totalSize }
    this.store.filesActiveTasks.next([task, ...this.store.filesActiveTasks.getValue()])
    this.layout.showRSideBarTab(TAB_MENU.TASKS, true)
    return task
  }

  removeAll() {
    this.http.delete(API_FILES_TASKS).subscribe({
      next: () => this.clearEndedTasks(),
      error: (e) => console.error(e)
    })
  }

  remove(task: FileTask) {
    this.http.delete(`${API_FILES_TASKS}/${task.id}`).subscribe({
      next: () => this.deleteTask(task.id, false),
      error: (e) => console.error(e)
    })
  }

  updateTask(task: FileTask) {
    if (task.status === FileTaskStatus.PENDING) {
      const currentTask = this.findTask(task.id, true)
      Object.assign(currentTask, task)
    } else {
      this.deleteTask(task.id, true)
      this.addTask(task)
      this.taskDone(task)
    }
  }

  private loadAll() {
    this.http.get<FileTask[]>(API_FILES_TASKS).subscribe({
      next: (fileTasks: FileTask[]) => fileTasks.forEach((task: FileTask) => this.addTask(task)),
      error: (e) => console.error(e)
    })
  }

  private doWatch() {
    if (this.store.filesActiveTasks.getValue().length) {
      this.fetchActiveTasks()
    } else {
      this.stopWatch()
    }
  }

  private startWatch() {
    if (!this.watcher || this.watcher.closed) {
      this.layout.showRSideBarTab(TAB_MENU.TASKS, true)
      this.watcher = this.watch.subscribe()
    }
  }

  private stopWatch() {
    if (this.watcher || !this.watcher.closed) {
      this.layout.hideRSideBarTab(TAB_MENU.TASKS, 3000)
      this.watcher.unsubscribe()
    }
  }

  private fetchActiveTasks() {
    for (const task of this.store.filesActiveTasks.getValue().filter((task: FileTask) => task.type !== FILE_OPERATION.UPLOAD)) {
      this.http.get<FileTask>(`${API_FILES_TASKS}/${task.id}`).subscribe({
        next: (task: FileTask) => this.updateTask(task),
        error: (e) => {
          if (e.status === 404) {
            task.result = e.error.message
            task.status = FileTaskStatus.ERROR
            this.updateTask(task)
          }
          console.warn(e)
        }
      })
    }
  }

  private findTask(taskId: string, active: boolean): FileTask {
    if (active) {
      return this.store.filesActiveTasks.getValue().find((task: FileTask) => task.id === taskId)
    }
    return this.store.filesEndedTasks.getValue().find((task: FileTask) => task.id === taskId)
  }

  private deleteTask(taskId: string, active: boolean) {
    if (active) {
      this.store.filesActiveTasks.next(this.store.filesActiveTasks.getValue().filter((task: FileTask) => task.id !== taskId))
    } else {
      this.store.filesEndedTasks.next(this.store.filesEndedTasks.getValue().filter((task: FileTask) => task.id !== taskId))
    }
  }

  private taskDone(task: FileTask) {
    if (task.type in this.onDone) {
      if (this.onDone[task.type].fileEvent) {
        const fileEvent: Partial<FileEvent> = { ...this.onDone[task.type].fileEvent, status: task.status }
        if (task.type === FILE_OPERATION.COPY || task.type === FILE_OPERATION.MOVE) {
          fileEvent.filePath = task.props.src.path
          fileEvent.fileName = task.props.src.name
          fileEvent.fileDstPath = task.path
        } else {
          fileEvent.filePath = task.path
          fileEvent.fileName = task.name
          if (task.type === FILE_OPERATION.COMPRESS) {
            fileEvent.archiveId = task.props.compressInDirectory === false ? task.id : null
          }
        }
        this.store.filesOnEvent.next(fileEvent as FileEvent)
      }
      if (task.status === FileTaskStatus.SUCCESS) {
        if (task.type === FILE_OPERATION.DELETE) {
          this.removeDeletedChildTasks(task)
        } else {
          this.layout.sendNotification('info', this.onDone[task.type].msg.success, task.name)
        }
      } else {
        this.layout.sendNotification('error', this.onDone[task.type].msg.failed, task.name, {
          error: { message: task.result }
        } as HttpErrorResponse)
      }
    }
  }

  private removeDeletedChildTasks(deleteTask: FileTask) {
    if (deleteTask.path.startsWith(SPACE_REPOSITORY.SHARES)) {
      this.remove(deleteTask)
    } else if (deleteTask.path.startsWith(SPACE_REPOSITORY.TRASH)) {
      for (const task of this.store.filesEndedTasks
        .getValue()
        .filter(
          (task: FileTask) => task.id !== deleteTask.id && task.type === FILE_OPERATION.DELETE && task.path.startsWith(SPACE_REPOSITORY.FILES)
        )) {
        // find deleted child tasks to remove it
        const taskPath = deleteTask.path.replace(SPACE_REPOSITORY.TRASH, SPACE_REPOSITORY.FILES)
        const match = new RegExp(`^${escapeRegexp(`${taskPath}/${deleteTask.name}`)}(/|$)`)
        if (match.test(`${task.path}/${task.name}`)) {
          this.remove(task)
        }
      }
      this.remove(deleteTask)
    }
  }

  private clearEndedTasks() {
    this.store.filesEndedTasks.next([])
  }
}
