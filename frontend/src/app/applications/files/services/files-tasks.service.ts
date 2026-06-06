import { HttpClient, HttpErrorResponse } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { FILE_OPERATION } from '@sync-in-server/backend/src/applications/files/constants/operations'
import { API_FILES_TASKS, API_FILES_TASKS_CANCEL, API_FILES_TASKS_POLL } from '@sync-in-server/backend/src/applications/files/constants/routes'
import type { FileTasksPollResponse } from '@sync-in-server/backend/src/applications/files/interfaces/file-task.interface'
import { FileTask, FileTaskStatus } from '@sync-in-server/backend/src/applications/files/models/file-task'
import { SPACE_REPOSITORY } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import { currentTimeStamp } from '@sync-in-server/backend/src/common/shared'
import { EMPTY, Observable, Subscription, timer } from 'rxjs'
import { catchError, exhaustMap, map, tap } from 'rxjs/operators'
import { genRandomUUID } from '../../../common/utils/functions'
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
  private cancellingTasks = new Set<string>()
  private uploadCancellationHandlers = new Map<string, () => void>()
  private loadSubscription: Subscription = null
  private watcher: Subscription = null
  private readonly watch = timer(1000, 1000).pipe(
    exhaustMap(() => this.fetchActiveTasks()),
    tap(({ activeTasks, endedTasks }) => this.reconcileServerTasks(activeTasks, endedTasks))
  )

  constructor() {
    this.store.user.subscribe((u: UserType) => {
      if (this.currentUserId !== u?.id) {
        this.loadSubscription?.unsubscribe()
        this.stopWatch(false)
      }
      if (u && this.currentUserId !== u.id) {
        // Load tasks when the user is defined and has changed to prevent interceptor redirects
        this.loadAll()
      }
      this.currentUserId = u?.id
    })
  }

  addTask(task: FileTask) {
    if (this.isActiveStatus(task.status)) {
      this.store.filesActiveTasks.next(this.prependUniqueTasks(this.store.filesActiveTasks.getValue(), [task]))
      this.startWatch()
    } else {
      this.store.filesEndedTasks.next(this.prependUniqueTasks(this.store.filesEndedTasks.getValue(), [task]))
    }
  }

  createUploadTask(path: string, name: string, totalSize: number): FileTask {
    const task = new FileTask(genRandomUUID(), FILE_OPERATION.UPLOAD, path, name)
    task.status = FileTaskStatus.QUEUED
    task.cancellable = false
    task.startedAt = currentTimeStamp(null, true)
    task.props = { progress: 1, size: 0, totalSize }
    this.store.filesActiveTasks.next(this.prependUniqueTasks(this.store.filesActiveTasks.getValue(), [task]))
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

  cancel(task: FileTask) {
    if (!this.canCancel(task)) return
    this.cancellingTasks.add(task.id)
    if (task.type === FILE_OPERATION.UPLOAD) {
      const cancelUpload = this.uploadCancellationHandlers.get(task.id)
      if (cancelUpload) {
        cancelUpload()
      } else {
        this.cancellingTasks.delete(task.id)
      }
      return
    }
    this.http.post<void>(`${API_FILES_TASKS_CANCEL}/${task.id}`, null).subscribe({
      error: (e) => {
        this.cancellingTasks.delete(task.id)
        console.error(e)
      }
    })
  }

  canCancel(task: FileTask): boolean {
    return (
      this.isActiveStatus(task.status) &&
      task.cancellable &&
      !this.cancellingTasks.has(task.id) &&
      (task.type !== FILE_OPERATION.UPLOAD || this.uploadCancellationHandlers.has(task.id))
    )
  }

  registerUploadCancellation(taskId: string, cancel: () => void) {
    this.uploadCancellationHandlers.set(taskId, cancel)
    const task = this.store.filesActiveTasks.getValue().find((activeTask: FileTask) => activeTask.id === taskId)
    if (task) {
      task.cancellable = true
    }
    this.store.filesActiveTasks.next([...this.store.filesActiveTasks.getValue()])
  }

  unregisterUploadCancellation(taskId: string) {
    this.uploadCancellationHandlers.delete(taskId)
    const task = this.store.filesActiveTasks.getValue().find((activeTask: FileTask) => activeTask.id === taskId)
    if (task) {
      task.cancellable = false
    }
  }

  updateTask(task: FileTask) {
    if (this.isActiveStatus(task.status)) {
      this.updateActiveTask(task)
    } else {
      this.cancellingTasks.delete(task.id)
      this.deleteTask(task.id, true)
      this.addTask(task)
      this.taskDone(task)
    }
  }

  private loadAll() {
    this.loadSubscription = this.http.get<FileTask[]>(API_FILES_TASKS).subscribe({
      next: (fileTasks: FileTask[]) => {
        const activeTasks: FileTask[] = []
        const endedTasks: FileTask[] = []
        for (const task of fileTasks) {
          const target = this.isActiveStatus(task.status) ? activeTasks : endedTasks
          target.push(task)
        }
        const uploads = this.store.filesActiveTasks.getValue().filter((task: FileTask) => task.type === FILE_OPERATION.UPLOAD)
        this.store.filesActiveTasks.next([...uploads, ...activeTasks])
        this.store.filesEndedTasks.next(endedTasks)
        if (activeTasks.length) {
          this.startWatch()
        }
      },
      error: (e) => console.error(e)
    })
  }

  private startWatch() {
    if (!this.watcher || this.watcher.closed) {
      this.layout.showRSideBarTab(TAB_MENU.TASKS, true)
      this.watcher = this.watch.subscribe()
    }
  }

  private stopWatch(hideSidebar = true) {
    if (!this.watcher || this.watcher.closed) return
    if (hideSidebar) {
      this.layout.hideRSideBarTab(TAB_MENU.TASKS, 3000)
    }
    this.watcher.unsubscribe()
  }

  private fetchActiveTasks(): Observable<{ activeTasks: FileTask[]; endedTasks: FileTask[] }> {
    const currentServerTasks = this.store.filesActiveTasks.getValue().filter((task: FileTask) => task.type !== FILE_OPERATION.UPLOAD)
    if (!currentServerTasks.length) {
      this.stopWatch(false)
      return EMPTY
    }
    return this.http
      .post<FileTasksPollResponse>(API_FILES_TASKS_POLL, {
        trackedIds: currentServerTasks.map((task: FileTask) => task.id)
      })
      .pipe(
        map(({ active, ended, missingIds }: FileTasksPollResponse) => {
          const currentTasksById = new Map(currentServerTasks.map((task: FileTask) => [task.id, task]))
          const missingTasks = missingIds
            .map((taskId: string) => currentTasksById.get(taskId))
            .filter((task: FileTask | undefined): task is FileTask => task !== undefined)
            .map((task: FileTask) => ({
              ...task,
              result: 'Task not found',
              status: FileTaskStatus.ERROR
            }))
          return { activeTasks: active, endedTasks: [...ended, ...missingTasks] }
        }),
        catchError((e) => {
          console.warn(e)
          return EMPTY
        })
      )
  }

  private reconcileServerTasks(activeTasks: FileTask[], endedTasks: FileTask[]) {
    const currentTasks = this.store.filesActiveTasks.getValue()
    const activeTasksById = new Map(activeTasks.map((task: FileTask) => [task.id, task]))
    const nextTasks: FileTask[] = []
    for (const task of currentTasks) {
      if (task.type === FILE_OPERATION.UPLOAD) {
        nextTasks.push(task)
        continue
      }
      const updatedTask = activeTasksById.get(task.id)
      if (updatedTask) {
        Object.assign(task, updatedTask)
        nextTasks.push(task)
        activeTasksById.delete(task.id)
      }
    }
    nextTasks.push(...activeTasksById.values())
    this.store.filesActiveTasks.next(nextTasks)

    if (endedTasks.length) {
      for (const task of endedTasks) {
        this.cancellingTasks.delete(task.id)
      }
      this.store.filesEndedTasks.next(this.prependUniqueTasks(this.store.filesEndedTasks.getValue(), endedTasks))
      for (const task of endedTasks) {
        this.taskDone(task)
      }
    }
    const hasServerTasks = nextTasks.some((task: FileTask) => task.type !== FILE_OPERATION.UPLOAD)
    if (!hasServerTasks) {
      this.stopWatch(nextTasks.length === 0)
    }
  }

  private isActiveStatus(status: FileTaskStatus): boolean {
    return status === FileTaskStatus.PENDING || status === FileTaskStatus.QUEUED
  }

  private updateActiveTask(task: FileTask) {
    const activeTasks = this.store.filesActiveTasks.getValue()
    const currentTask = activeTasks.find((activeTask: FileTask) => activeTask.id === task.id)
    if (!currentTask) return
    Object.assign(currentTask, task)
    this.store.filesActiveTasks.next([...activeTasks])
  }

  private prependUniqueTasks(currentTasks: FileTask[], tasks: FileTask[]): FileTask[] {
    if (!tasks.length) return currentTasks
    const taskIds = new Set(tasks.map((task: FileTask) => task.id))
    return [...tasks, ...currentTasks.filter((task: FileTask) => !taskIds.has(task.id))]
  }

  private deleteTask(taskId: string, active: boolean) {
    if (active) {
      this.store.filesActiveTasks.next(this.store.filesActiveTasks.getValue().filter((task: FileTask) => task.id !== taskId))
    } else {
      this.store.filesEndedTasks.next(this.store.filesEndedTasks.getValue().filter((task: FileTask) => task.id !== taskId))
    }
  }

  private taskDone(task: FileTask) {
    if (task.status === FileTaskStatus.CANCELLED) return
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
      const deletedTrashPath = `${deleteTask.path}/${deleteTask.name}`
      const deletedFilesPath = `${SPACE_REPOSITORY.FILES}${deletedTrashPath.slice(SPACE_REPOSITORY.TRASH.length)}`
      const relatedTasks = this.store.filesEndedTasks.getValue().filter((task: FileTask) => {
        if (task.id === deleteTask.id || task.type !== FILE_OPERATION.DELETE) return false
        const taskPath = `${task.path}/${task.name}`
        return (
          taskPath === deletedTrashPath ||
          taskPath.startsWith(`${deletedTrashPath}/`) ||
          taskPath === deletedFilesPath ||
          taskPath.startsWith(`${deletedFilesPath}/`)
        )
      })
      for (const task of relatedTasks) {
        this.remove(task)
      }
      this.remove(deleteTask)
    }
  }

  private clearEndedTasks() {
    this.store.filesEndedTasks.next([])
  }
}
