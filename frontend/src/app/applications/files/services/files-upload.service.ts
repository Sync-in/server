import { HttpClient, HttpEventType, HttpUploadProgressEvent } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { API_FILES_OPERATION_UPLOAD } from '@sync-in-server/backend/src/applications/files/constants/routes'
import type { FileTask } from '@sync-in-server/backend/src/applications/files/models/file-task'
import { FileTaskStatus } from '@sync-in-server/backend/src/applications/files/models/file-task'
import { Observable, Subscription } from 'rxjs'
import { supportUploadDirectory } from '../../../common/utils/functions'
import type { FileUpload, FileUploadTaskRequest } from '../interfaces/file-upload.interface'
import { FileModel } from '../models/file.model'
import { FilesTasksService } from './files-tasks.service'
import { FilesService } from './files.service'

@Injectable({ providedIn: 'root' })
export class FilesUploadService {
  public supportUploadDirectory = supportUploadDirectory()
  private readonly http = inject(HttpClient)
  private readonly filesService = inject(FilesService)
  private readonly filesTasksService = inject(FilesTasksService)
  private readonly maxConcurrentUploads = 3
  private queuedUploads: FileUploadTaskRequest[] = []
  private runningUploads = 0

  async addFiles(files: FileUpload[], overwrite: boolean) {
    const apiRoute = `${API_FILES_OPERATION_UPLOAD}/${this.filesService.currentRoute}`
    const taskReqs: FileUploadTaskRequest[] = []

    for (const [key, data] of Object.entries(this.sortFiles(files))) {
      const path = `${this.filesService.currentRoute}/${key}`.split('/').slice(0, -1).join('/')
      const name = `${this.filesService.currentRoute}/${key}`.split('/').slice(-1)[0]
      const task: FileTask = this.filesTasksService.createUploadTask(path, name, data.size)
      const taskReq = this.createUploadTaskRequest(task, this.uploadFiles(`${apiRoute}/${key}`, data.form, overwrite))
      this.filesTasksService.registerUploadCancellation(task.id, () => this.cancelUploadTask(taskReq))
      taskReqs.unshift(taskReq)
    }
    this.queuedUploads.push(...taskReqs)
    this.drainUploadQueue()
    await Promise.all(taskReqs.map((taskReq: FileUploadTaskRequest) => taskReq.completed))
  }

  onDropFiles(ev: any, exist: FileModel[]) {
    /*
     Important: dataTransfer.items must be accessed synchronously before any async operation; overwrite is handled after all analyses.
     Parameter `exist`: files already present in the current drop target.
    */
    if (ev.dataTransfer.items && ev.dataTransfer.items[0]?.webkitGetAsEntry) {
      this.webkitReadDataTransfer(ev, exist)
    } else {
      this.addFiles(ev.dataTransfer.files, exist.length > 0).catch(console.error)
    }
  }

  uploadFileContent(file: FileModel, content: string, updateContent = false, overwrite = false) {
    const url = `${API_FILES_OPERATION_UPLOAD}/${file.path}`
    const fileName = (file?.root?.alias || file.name).normalize()
    const fileContent = new File([new Blob([content])], fileName, { type: file.mime.replace('-', '/') })
    const formData = new FormData()
    formData.append('file', fileContent)
    return this.http.request<void>(updateContent ? 'patch' : overwrite ? 'put' : 'post', url, { body: formData })
  }

  private uploadFiles(url: string, form: FormData, overwrite: boolean) {
    return this.http.request(overwrite ? 'put' : 'post', url, {
      body: form,
      reportProgress: true,
      observe: 'events'
    })
  }

  private createUploadTaskRequest(task: FileTask, req: Observable<any>): FileUploadTaskRequest {
    let resolveCompleted: () => void = () => undefined
    const completed = new Promise<void>((resolve) => {
      resolveCompleted = () => resolve()
    })
    return {
      completed,
      controller: new AbortController(),
      done: false,
      req,
      resolveCompleted,
      started: false,
      task
    }
  }

  private drainUploadQueue() {
    while (this.runningUploads < this.maxConcurrentUploads && this.queuedUploads.length) {
      const taskReq = this.queuedUploads.shift()
      if (!taskReq || taskReq.done) continue
      this.runningUploads++
      void this.runUploadTask(taskReq).finally(() => {
        this.runningUploads--
        this.drainUploadQueue()
      })
    }
  }

  private async runUploadTask(taskReq: FileUploadTaskRequest): Promise<void> {
    const { controller, req, task } = taskReq
    if (taskReq.done) return
    taskReq.started = true
    try {
      await this.runUpload(task, req, controller.signal)
      task.props.progress = 100
      task.status = FileTaskStatus.SUCCESS
    } catch (e: any) {
      if (this.isUploadCancelled(e)) {
        this.setUploadCancelled(task)
      } else {
        this.setUploadError(task, e)
      }
    } finally {
      this.finishUploadTask(taskReq)
    }
  }

  private finishUploadTask(taskReq: FileUploadTaskRequest) {
    if (taskReq.done) return
    taskReq.done = true
    this.filesTasksService.unregisterUploadCancellation(taskReq.task.id)
    this.filesTasksService.updateTask(taskReq.task)
    taskReq.resolveCompleted()
  }

  private runUpload(task: FileTask, req: Observable<any>, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(signal.reason)
        return
      }
      let settled = false
      const subscription = new Subscription()
      const onAbort = () => {
        subscription.unsubscribe()
        settle(() => reject(signal.reason))
      }
      const settle = (done: () => void) => {
        if (settled) return
        settled = true
        signal.removeEventListener('abort', onAbort)
        done()
      }
      signal.addEventListener('abort', onAbort, { once: true })
      subscription.add(
        req.subscribe({
          next: (ev: any) => {
            if (ev.type === HttpEventType.UploadProgress) {
              this.updateProgress(task, ev)
            }
          },
          error: (e) => settle(() => reject(e)),
          complete: () => settle(resolve)
        })
      )
    })
  }

  private cancelUploadTask(taskReq: FileUploadTaskRequest) {
    if (taskReq.done) return
    taskReq.controller.abort(new Error('Cancelled'))
    if (taskReq.started) return
    this.queuedUploads = this.queuedUploads.filter((queuedTaskReq: FileUploadTaskRequest) => queuedTaskReq !== taskReq)
    this.setUploadCancelled(taskReq.task)
    this.finishUploadTask(taskReq)
  }

  private isUploadCancelled(e: any): boolean {
    return e?.message === 'Cancelled'
  }

  private setUploadCancelled(task: FileTask) {
    task.status = FileTaskStatus.CANCELLED
    task.result = 'Cancelled'
  }

  private setUploadError(task: FileTask, e: any) {
    task.status = FileTaskStatus.ERROR
    task.result = e.status === 0 ? e.statusText : e.error?.message || e.message
  }

  private updateProgress(task: FileTask, ev: HttpUploadProgressEvent) {
    task.props.size = ev.loaded
    task.props.progress = Math.round((100 * ev.loaded) / ev.total)
  }

  private sortFiles(files: FileUpload[]): Record<string, { nb: number; size: number; form: FormData }> {
    /* Separate files in root directory and directories */
    const sort: Record<string, { nb: number; size: number; form: FormData }> = {}
    for (const f of files) {
      const relPath = f.relativePath || f.webkitRelativePath
      const key = (relPath ? relPath.split('/')[0] : f.name).normalize()
      if (!(key in sort)) sort[key] = { nb: 0, size: 0, form: new FormData() }
      sort[key].form.append('file', f, (relPath || f.name).normalize())
      sort[key].nb++
      sort[key].size += f.size
    }
    return sort
  }

  private webkitReadDataTransfer(ev: any, exist: FileModel[]) {
    let queue = ev.dataTransfer.items.length
    const files: FileUpload[] = []
    const readDirectory = (reader: any) => {
      reader.readEntries(function (entries: any[]) {
        if (entries.length) {
          queue += entries.length
          for (const entry of entries) {
            if (entry.isFile) {
              entry.file((file: FileUpload) => {
                fileReadSuccess(entry, file)
              }, readError)
            } else if (entry.isDirectory) {
              readDirectory(entry.createReader())
            }
          }
          readDirectory(reader)
        } else {
          decrement()
        }
      }, readError)
    }
    const fileReadSuccess = (entry: { fullPath?: string }, file: FileUpload) => {
      setRelativePath(entry, file)
      files.push(file)
      decrement()
    }
    const readError = (fileError: any) => {
      decrement()
      throw fileError
    }
    const decrement = () => {
      if (--queue == 0) {
        if (exist.length <= 0) {
          this.addFiles(files, false).catch(console.error)
          return
        }
        this.filesService
          .openOverwriteDialog(exist)
          .then((overwrite) => {
            if (overwrite) {
              this.addFiles(files, true).catch(console.error)
            }
          })
          .catch(console.error)
      }
    }

    const setRelativePath = (entry: { fullPath?: string }, file: FileUpload) => {
      if (entry.fullPath && entry.fullPath !== `/${file.name}`) {
        file.relativePath = entry.fullPath.startsWith('/') ? entry.fullPath.slice(1) : entry.fullPath
      }
    }

    for (const item of ev.dataTransfer.items) {
      const entry = item.webkitGetAsEntry()
      if (!entry) {
        decrement()
        return
      }
      if (entry.isFile) {
        fileReadSuccess(entry, item.getAsFile())
      } else {
        readDirectory(entry.createReader())
      }
    }
  }
}
