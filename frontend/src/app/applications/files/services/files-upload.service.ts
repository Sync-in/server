import { HttpClient, HttpErrorResponse, HttpEvent, HttpEventType, HttpResponse, HttpStatusCode } from '@angular/common/http'
import { effect, inject, Injectable } from '@angular/core'
import { FILE_UPLOAD_MULTIPART_MAX_FILES } from '@sync-in-server/backend/src/applications/files/core/constants/files'
import { API_FILES_OPERATION_UPLOAD, API_FILES_OPERATION_UPLOAD_SESSION } from '@sync-in-server/backend/src/applications/files/core/constants/routes'
import type { FileTask } from '@sync-in-server/backend/src/applications/files/tasks/models/file-task'
import { FileTaskStatus } from '@sync-in-server/backend/src/applications/files/tasks/models/file-task'
import type { FileUploadSessionStatus } from '@sync-in-server/backend/src/applications/files/operations/interfaces/file-upload-session.interface'
import { currentTimeStamp, encodeUrl } from '@sync-in-server/backend/src/common/shared'
import { catchError, Observable, Subscription, throwError, timeout, TimeoutError } from 'rxjs'
import { genRandomUUID, supportUploadDirectory } from '../../../common/utils/functions'
import { LayoutService } from '../../../layout/layout.service'
import { StoreService } from '../../../store/store.service'
import type { FileUpload, FileUploadGroup, FileUploadMultipartBatch, FileUploadTaskRequest } from '../interfaces/file-upload.interface'
import { FileModel } from '../models/file.model'
import { FilesTasksService } from './files-tasks.service'
import { FilesService } from './files.service'

@Injectable({ providedIn: 'root' })
export class FilesUploadService {
  public supportUploadDirectory = supportUploadDirectory()
  private readonly http = inject(HttpClient)
  private readonly filesService = inject(FilesService)
  private readonly filesTasksService = inject(FilesTasksService)
  private readonly layout = inject(LayoutService)
  private readonly store = inject(StoreService)
  private readonly maxConcurrentUploads = 3
  private readonly sessionRetryCount = 3
  private readonly sessionRetryWaitMilliSeconds = 2000
  private readonly sessionRetryMaxWaitMilliSeconds = 30000
  private readonly sessionCleanupTimeoutMilliSeconds = 10000
  private readonly progressUpdateInterval = 1000
  private readonly progressUpdateTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly progressUpdatedAt = new Map<string, number>()
  private readonly activeUploads = new Set<FileUploadTaskRequest>()
  private queuedUploads: FileUploadTaskRequest[] = []
  private runningUploads = 0

  constructor() {
    effect(() => {
      if (!this.activeUploads.size) {
        this.store.user()
        this.store.userImpersonate()
        return
      }
      // Stop work owned by the previous authentication context.
      // Any session that cannot be deleted with the new identity is left to the scheduler.
      for (const taskReq of this.activeUploads) {
        if (!this.isCurrentUploadIdentity(taskReq)) this.cancelUploadTask(taskReq, true)
      }
    })
  }

  async addFiles(files: FileUpload[], overwrite: boolean) {
    const currentRoute = this.filesService.currentRoute
    const uploadUserId = this.store.user()?.id
    const uploadUserImpersonate = this.store.userImpersonate()
    const apiRoute = `${API_FILES_OPERATION_UPLOAD}/${currentRoute}`
    const taskReqs: FileUploadTaskRequest[] = []
    const maxChunkSize = this.store.server().files.transfers.maxChunkSize

    for (const [key, data] of this.groupFiles(files, maxChunkSize)) {
      const path = `${currentRoute}/${key}`.split('/').slice(0, -1).join('/')
      const name = `${currentRoute}/${key}`.split('/').slice(-1)[0]
      const task: FileTask = this.filesTasksService.createUploadTask(path, name, data.size)
      const taskReq = this.createUploadTaskRequest(
        task,
        async (uploadTask: FileTask, signal: AbortSignal) => {
          let completedSize = 0
          if (
            !overwrite &&
            !data.multipartBatches.length &&
            data.sessionFiles.some((file) => Boolean(file.relativePath || file.webkitRelativePath))
          ) {
            // File sessions target individual files, so create the top-level directory before uploading a directory containing only large files.
            await this.runHttpRequest(this.filesService.make('directory', key, currentRoute, true), signal)
          }
          for (const batch of data.multipartBatches) {
            await this.runHttpRequest(
              this.uploadFiles(`${apiRoute}/${key}`, batch.form, overwrite ? 'put' : 'post'),
              signal,
              (event: HttpEvent<unknown>) => {
                if (event.type === HttpEventType.UploadProgress) {
                  const loaded = event.total ? Math.round((batch.size * event.loaded) / event.total) : Math.min(batch.size, event.loaded)
                  this.updateChunkProgress(uploadTask, data.size, completedSize, loaded)
                }
              }
            )
            completedSize += batch.size
            this.updateChunkProgress(uploadTask, data.size, completedSize, 0)
          }
          for (const file of data.sessionFiles) {
            if (maxChunkSize === null) throw new Error('Chunked uploads are disabled')
            await this.uploadFileInChunks(
              file,
              this.getUploadDestination(file, currentRoute),
              overwrite,
              uploadTask,
              signal,
              completedSize,
              data.size,
              maxChunkSize
            )
            completedSize += file.size
          }
        },
        files.length === 1,
        uploadUserId,
        uploadUserImpersonate
      )
      this.activeUploads.add(taskReq)
      this.filesTasksService.registerUploadCancellation(task.id, () => this.cancelUploadTask(taskReq))
      taskReqs.unshift(taskReq)
    }
    this.queuedUploads.push(...taskReqs)
    this.drainUploadQueue()
    await Promise.all(taskReqs.map((taskReq: FileUploadTaskRequest) => taskReq.completed))
    if (files.length > 1 && taskReqs.every((taskReq: FileUploadTaskRequest) => this.isCurrentUploadIdentity(taskReq) && !taskReq.discarded)) {
      this.notifyUploadBatch(taskReqs)
    }
  }

  async addFilesWithConflictResolution(files: FileUpload[], exist: FileModel[]): Promise<void> {
    let filesToUpload = files
    let overwrite = false
    if (exist.length) {
      const action = await this.filesService.openOverwriteDialog(exist)
      if (action === 'cancel') return
      overwrite = action === 'overwrite'
      if (action === 'skip') {
        const existingNames = new Set(exist.map((file) => file.name.normalize().toLowerCase()))
        filesToUpload = files.filter((file) => {
          const relativePath = file.relativePath || file.webkitRelativePath
          const topLevelName = relativePath ? relativePath.split('/')[0] : file.name
          return !existingNames.has(topLevelName.normalize().toLowerCase())
        })
        if (!filesToUpload.length) return
      }
    }
    await this.addFiles(filesToUpload, overwrite)
  }

  onDropFiles(ev: any, exist: FileModel[]) {
    /*
     Important: dataTransfer.items must be accessed synchronously before any async operation; overwrite is handled after all analyses.
     Parameter `exist`: files already present in the current drop target.
    */
    if (ev.dataTransfer.items && ev.dataTransfer.items[0]?.webkitGetAsEntry) {
      this.webkitReadDataTransfer(ev, exist)
    } else {
      this.addFilesWithConflictResolution([...ev.dataTransfer.files], exist).catch(console.error)
    }
  }

  uploadFileContent(file: FileModel, content: string, updateContent = false, overwrite = false) {
    const url = `${API_FILES_OPERATION_UPLOAD}/${file.path}`
    const fileName = (file.rootAlias || file.name).normalize()
    const fileContent = new File([new Blob([content])], fileName, { type: file.mime.replace('-', '/') })
    const formData = new FormData()
    formData.append('file', fileContent)
    return this.http.request<void>(updateContent ? 'patch' : overwrite ? 'put' : 'post', url, { body: formData })
  }

  uploadFileBlob(file: FileModel, content: Blob) {
    const url = `${API_FILES_OPERATION_UPLOAD}/${file.path}`
    const fileName = (file.rootAlias || file.name).normalize()
    const fileContent = new File([content], fileName, { type: file.mime.replace('-', '/') })
    const formData = new FormData()
    formData.append('file', fileContent)
    return this.http.patch<void>(url, formData)
  }

  uploadNewFileContent(directoryPath: string, fileName: string, content: string) {
    const formData = new FormData()
    formData.append('file', new File([new Blob([content])], fileName, { type: 'application/x-drawio' }))
    return this.http.post<void>(`${API_FILES_OPERATION_UPLOAD}/${directoryPath}/${fileName}`, formData)
  }

  private uploadFiles(url: string, form: FormData, method: 'post' | 'put') {
    return this.http.request(method, url, {
      body: form,
      reportUploadProgress: true,
      observe: 'events'
    })
  }

  private async uploadFileInChunks(
    file: FileUpload,
    destination: string,
    overwrite: boolean,
    task: FileTask,
    signal: AbortSignal,
    completedSize: number,
    totalSize: number,
    chunkSize: number
  ): Promise<void> {
    const uploadId = genRandomUUID()
    const sessionUrl = `${API_FILES_OPERATION_UPLOAD_SESSION}/${encodeURIComponent(uploadId)}/${destination}`
    let offset = 0
    let recoveryAttempts = 0
    let reconcileSession = false
    let sessionCreated = false
    try {
      while (true) {
        if (reconcileSession) {
          try {
            const status = await this.getUploadSessionStatus(sessionUrl, file.size, signal)
            // HEAD is authoritative, including after a durability failure rolls the persisted payload back.
            if (status.offset > offset) recoveryAttempts = 0
            offset = status.offset
            sessionCreated = true
            this.updateChunkProgress(task, totalSize, completedSize + offset, 0)
            reconcileSession = false
            if (status.state === 'complete') return
          } catch (error) {
            if (!sessionCreated && this.isUploadSessionNotFoundError(error)) {
              reconcileSession = false
              continue
            }
            if (signal.aborted || !this.isUploadSessionRetryableError(error)) throw error
            recoveryAttempts = await this.recoverUploadSession(error, recoveryAttempts, signal)
            continue
          }
        }

        const chunkEnd = sessionCreated && offset === file.size ? offset : Math.min(offset + chunkSize, file.size)
        try {
          const status = await this.uploadChunk(
            sessionUrl,
            file,
            offset,
            chunkEnd,
            sessionCreated ? 'patch' : overwrite ? 'put' : 'post',
            task,
            signal,
            completedSize,
            totalSize
          )
          sessionCreated = true
          if (status.offset !== chunkEnd) throw new Error('Invalid upload offset response')
          offset = status.offset
          recoveryAttempts = 0
          this.updateChunkProgress(task, totalSize, completedSize + offset, 0)
          if (status.state === 'complete') return
        } catch (error) {
          if (signal.aborted || !this.isUploadSessionTransferRecoveryError(error)) throw error
          recoveryAttempts = await this.recoverUploadSession(error, recoveryAttempts, signal)
          reconcileSession = true
          continue
        }
      }
    } catch (error) {
      await this.cleanupUploadSession(uploadId, destination)
      throw error
    }
  }

  private uploadChunk(
    sessionUrl: string,
    file: FileUpload,
    offset: number,
    chunkEnd: number,
    method: 'patch' | 'post' | 'put',
    task: FileTask,
    signal: AbortSignal,
    completedSize: number,
    totalSize: number
  ): Promise<FileUploadSessionStatus> {
    return this.runHttpRequest(
      this.http.request<void>(method, sessionUrl, {
        body: file.slice(offset, chunkEnd),
        headers: {
          'Content-Type': 'application/octet-stream',
          'Upload-Length': String(file.size),
          'Upload-Offset': String(offset)
        },
        observe: 'events',
        reportUploadProgress: true
      }),
      signal,
      (event: HttpEvent<void>) => {
        if (event.type === HttpEventType.UploadProgress) {
          this.updateChunkProgress(task, totalSize, completedSize + offset, event.loaded)
        }
      }
    ).then((event) => {
      if (!(event instanceof HttpResponse)) throw new Error('Invalid upload chunk response')
      return this.parseUploadSessionStatus(event, file.size)
    })
  }

  private async getUploadSessionStatus(sessionUrl: string, expectedSize: number, signal: AbortSignal): Promise<FileUploadSessionStatus> {
    const response = await this.runHttpRequest(this.http.head<void>(sessionUrl, { observe: 'response' }), signal)
    return this.parseUploadSessionStatus(response, expectedSize)
  }

  private parseUploadSessionStatus(response: HttpResponse<unknown>, expectedSize: number): FileUploadSessionStatus {
    const status = {
      offset: this.parseUploadSessionIntegerHeader(response, 'Upload-Offset'),
      size: this.parseUploadSessionIntegerHeader(response, 'Upload-Length'),
      state: response.headers.get('Upload-State')
    }
    if (
      status.size !== expectedSize ||
      status.offset > status.size ||
      !['complete', 'ready', 'uploading'].includes(status.state ?? '') ||
      (status.state === 'uploading' ? status.offset >= status.size : status.offset !== status.size)
    ) {
      throw new Error('Invalid upload session status response')
    }
    return status as FileUploadSessionStatus
  }

  private parseUploadSessionIntegerHeader(response: HttpResponse<unknown>, header: string): number {
    const value = response.headers.get(header)
    if (!value || !/^\d+$/.test(value)) throw new Error(`Invalid ${header} response header`)
    const parsed = Number(value)
    if (!Number.isSafeInteger(parsed)) throw new Error(`Invalid ${header} response header`)
    return parsed
  }

  private isUploadSessionRetryableError(error: unknown): error is HttpErrorResponse {
    return (
      error instanceof HttpErrorResponse &&
      (error.status === 0 ||
        error.status === HttpStatusCode.Locked ||
        (error.status >= 500 && error.status < 600 && error.status !== HttpStatusCode.InsufficientStorage))
    )
  }

  private isUploadSessionConflictError(error: unknown): error is HttpErrorResponse {
    return error instanceof HttpErrorResponse && error.status === 409
  }

  private isUploadSessionNotFoundError(error: unknown): error is HttpErrorResponse {
    return error instanceof HttpErrorResponse && error.status === HttpStatusCode.NotFound
  }

  private isUploadSessionTransferRecoveryError(error: unknown): error is HttpErrorResponse {
    return this.isUploadSessionRetryableError(error) || this.isUploadSessionConflictError(error)
  }

  private cleanupUploadSession(uploadId: string, destination: string): Promise<void> {
    return this.retryUploadSessionRequest(
      () =>
        this.runHttpRequest(
          this.http.delete<void>(`${API_FILES_OPERATION_UPLOAD_SESSION}/${encodeURIComponent(uploadId)}/${destination}`).pipe(
            timeout(this.sessionCleanupTimeoutMilliSeconds),
            catchError((error) =>
              throwError(() => (error instanceof TimeoutError ? new HttpErrorResponse({ status: 0, statusText: 'Cleanup timed out' }) : error))
            )
          )
        ),
      undefined,
      this.sessionRetryCount
    ).catch(() => undefined)
  }

  private async retryUploadSessionRequest<T>(request: () => Promise<T>, signal?: AbortSignal, retryCount = this.sessionRetryCount): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await request()
      } catch (error) {
        if (!this.isUploadSessionRetryableError(error) || attempt >= retryCount) throw error
        await this.waitForUploadSessionRetry(error, attempt + 1, signal)
      }
    }
  }

  private async recoverUploadSession(error: HttpErrorResponse, attempt: number, signal: AbortSignal): Promise<number> {
    if (attempt >= this.sessionRetryCount) throw error
    await this.waitForUploadSessionRetry(error, attempt + 1, signal)
    return attempt + 1
  }

  private waitForUploadSessionRetry(error: HttpErrorResponse, attempt: number, signal?: AbortSignal): Promise<void> {
    const retryAfterSeconds = Number(error.headers.get('Retry-After') ?? NaN)
    const retryAfterDelay = Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0 ? retryAfterSeconds * 1000 : 0
    const backoffDelay = Math.min(this.sessionRetryWaitMilliSeconds * 2 ** Math.max(0, attempt - 1), this.sessionRetryMaxWaitMilliSeconds)
    const delay = Math.min(Math.max(retryAfterDelay, backoffDelay), this.sessionRetryMaxWaitMilliSeconds)
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason)
        return
      }
      const onAbort = () => {
        clearTimeout(timer)
        reject(signal?.reason)
      }
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort)
        resolve()
      }, delay)
      signal?.addEventListener('abort', onAbort, { once: true })
    })
  }

  private runHttpRequest<T>(request: Observable<T>, signal?: AbortSignal, onNext?: (value: T) => void): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason)
        return
      }
      let latestValue!: T
      let settled = false
      const subscription = new Subscription()
      const settle = (done: () => void) => {
        if (settled) return
        settled = true
        signal?.removeEventListener('abort', onAbort)
        done()
      }
      const onAbort = () => {
        settle(() => reject(signal?.reason))
        subscription.unsubscribe()
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      subscription.add(
        request.subscribe({
          next: (value: T) => {
            latestValue = value
            onNext?.(value)
          },
          error: (error) => settle(() => reject(error)),
          complete: () => settle(() => resolve(latestValue))
        })
      )
    })
  }

  private notifyUploadBatch(taskReqs: FileUploadTaskRequest[]) {
    let succeeded = 0
    let failed = 0
    let cancelled = 0
    // A directory upload can partially succeed, so count task statuses rather than individual files.
    for (const { task } of taskReqs) {
      switch (task.status) {
        case FileTaskStatus.SUCCESS:
          succeeded++
          break
        case FileTaskStatus.ERROR:
          failed++
          break
        case FileTaskStatus.CANCELLED:
          cancelled++
          break
      }
    }
    const message = [
      succeeded ? this.layout.translateString(succeeded === 1 ? 'one_element_uploaded' : 'nb_elements_uploaded', { nb: succeeded }) : null,
      failed ? this.layout.translateString(failed === 1 ? 'one_element_failed' : 'nb_elements_failed', { nb: failed }) : null,
      cancelled ? this.layout.translateString(cancelled === 1 ? 'one_element_cancelled' : 'nb_elements_cancelled', { nb: cancelled }) : null
    ]
      .filter(Boolean)
      .join(' · ')
    this.layout.sendNotification(
      failed ? 'error' : cancelled ? 'warning' : 'info',
      failed ? 'Upload failed' : cancelled ? 'Cancelled' : 'Upload done',
      message
    )
  }

  private createUploadTaskRequest(
    task: FileTask,
    run: (task: FileTask, signal: AbortSignal) => Promise<void>,
    notifyCompletion: boolean,
    userId: number | undefined,
    userImpersonate: boolean
  ): FileUploadTaskRequest {
    let resolveCompleted: () => void = () => undefined
    const completed = new Promise<void>((resolve) => {
      resolveCompleted = () => resolve()
    })
    return {
      completed,
      controller: new AbortController(),
      discarded: false,
      done: false,
      notifyCompletion,
      resolveCompleted,
      run,
      started: false,
      task,
      userId,
      userImpersonate
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
    const { controller, run, task } = taskReq
    if (taskReq.done) return
    if (!this.isCurrentUploadIdentity(taskReq)) {
      this.cancelUploadTask(taskReq, true)
      return
    }
    taskReq.started = true
    task.status = FileTaskStatus.PENDING
    task.startedAt = currentTimeStamp(null, true)
    this.updateTask(task)
    try {
      await run(task, controller.signal)
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
    this.clearProgressUpdate(taskReq.task.id)
    taskReq.done = true
    if (taskReq.task.status !== FileTaskStatus.PENDING && taskReq.task.status !== FileTaskStatus.QUEUED) {
      taskReq.task.endedAt = currentTimeStamp(null, true)
    }
    taskReq.discarded ||= !this.isCurrentUploadIdentity(taskReq)
    this.activeUploads.delete(taskReq)
    this.filesTasksService.unregisterUploadCancellation(taskReq.task.id)
    if (taskReq.discarded) {
      this.store.filesActiveTasks.update((tasks) => tasks.filter((task: FileTask) => task.id !== taskReq.task.id))
    } else {
      this.updateTask(taskReq.task, taskReq.notifyCompletion)
    }
    taskReq.resolveCompleted()
  }

  private cancelUploadTask(taskReq: FileUploadTaskRequest, discard = false) {
    if (taskReq.done) return
    taskReq.discarded ||= discard
    if (discard) {
      this.clearProgressUpdate(taskReq.task.id)
      this.store.filesActiveTasks.update((tasks) => tasks.filter((task: FileTask) => task.id !== taskReq.task.id))
    }
    taskReq.controller.abort(new Error('Cancelled'))
    if (!taskReq.started) {
      this.queuedUploads = this.queuedUploads.filter((queuedTaskReq: FileUploadTaskRequest) => queuedTaskReq !== taskReq)
      this.setUploadCancelled(taskReq.task)
      this.finishUploadTask(taskReq)
    }
  }

  private isCurrentUploadIdentity(taskReq: FileUploadTaskRequest): boolean {
    return taskReq.userId === this.store.user()?.id && taskReq.userImpersonate === this.store.userImpersonate()
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

  private updateChunkProgress(task: FileTask, totalSize: number, confirmedOffset: number, currentChunkLoaded: number) {
    task.props.size = Math.min(totalSize, confirmedOffset + currentChunkLoaded)
    task.props.progress = totalSize ? Math.min(99, Math.round((100 * task.props.size) / totalSize)) : task.props.progress || 1
    this.scheduleProgressUpdate(task)
  }

  private scheduleProgressUpdate(task: FileTask) {
    const now = Date.now()
    const lastUpdate = this.progressUpdatedAt.get(task.id) || 0
    const elapsed = now - lastUpdate
    if (elapsed >= this.progressUpdateInterval) {
      this.emitProgressUpdate(task)
      return
    }
    if (this.progressUpdateTimers.has(task.id)) return
    const timer = setTimeout(() => {
      this.progressUpdateTimers.delete(task.id)
      this.emitProgressUpdate(task)
    }, this.progressUpdateInterval - elapsed)
    this.progressUpdateTimers.set(task.id, timer)
  }

  private emitProgressUpdate(task: FileTask) {
    this.progressUpdatedAt.set(task.id, Date.now())
    this.updateTask(task)
  }

  private clearProgressUpdate(taskId: string) {
    const timer = this.progressUpdateTimers.get(taskId)
    if (timer) {
      clearTimeout(timer)
      this.progressUpdateTimers.delete(taskId)
    }
    this.progressUpdatedAt.delete(taskId)
  }

  private updateTask(task: FileTask, notifyCompletion = true) {
    this.filesTasksService.updateTask(task, notifyCompletion)
  }

  private getUploadDestination(file: FileUpload, currentRoute: string): string {
    const relativePath = (file.relativePath || file.webkitRelativePath || file.name).replace(/^\/+/, '').normalize()
    return encodeUrl(`${currentRoute.replace(/\/$/, '')}/${relativePath}`)
  }

  private groupFiles(files: FileUpload[], maxBatchSize: number | null): Map<string, FileUploadGroup> {
    const groups = new Map<string, FileUploadGroup>()
    for (const file of files) {
      const relativePath = file.relativePath || file.webkitRelativePath
      const key = (relativePath ? relativePath.split('/')[0] : file.name).normalize()
      const group = groups.get(key) ?? { multipartBatches: [], sessionFiles: [], size: 0 }
      if (maxBatchSize !== null && file.size > maxBatchSize) {
        group.sessionFiles.push(file)
      } else {
        let batch: FileUploadMultipartBatch | undefined = group.multipartBatches.at(-1)
        if (!batch || batch.fileCount === FILE_UPLOAD_MULTIPART_MAX_FILES || (maxBatchSize !== null && batch.size + file.size > maxBatchSize)) {
          batch = { fileCount: 0, form: new FormData(), size: 0 }
          group.multipartBatches.push(batch)
        }
        batch.form.append('file', file, (relativePath || file.name).normalize())
        batch.fileCount++
        batch.size += file.size
      }
      group.size += file.size
      groups.set(key, group)
    }
    return groups
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
        this.addFilesWithConflictResolution(files, exist).catch(console.error)
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
