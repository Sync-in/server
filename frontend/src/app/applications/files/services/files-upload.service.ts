/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpClient, HttpEventType, HttpUploadProgressEvent } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { API_FILES_OPERATION_UPLOAD } from '@sync-in-server/backend/src/applications/files/constants/routes'
import { FileTask, FileTaskStatus } from '@sync-in-server/backend/src/applications/files/models/file-task'
import { lastValueFrom, Observable } from 'rxjs'
import { filter, tap } from 'rxjs/operators'
import { supportUploadDirectory } from '../../../common/utils/functions'
import { FileUpload } from '../interfaces/file-upload.interface'
import { FileModel } from '../models/file.model'
import { FilesTasksService } from './files-tasks.service'
import { FilesService } from './files.service'

@Injectable({ providedIn: 'root' })
export class FilesUploadService {
  public supportUploadDirectory = supportUploadDirectory()
  private readonly http = inject(HttpClient)
  private readonly filesService = inject(FilesService)
  private readonly filesTasksService = inject(FilesTasksService)

  async addFiles(files: FileUpload[], overwrite: boolean) {
    const apiRoute = `${API_FILES_OPERATION_UPLOAD}/${this.filesService.currentRoute}`
    const taskReqs: [FileTask, Observable<any>][] = []

    for (const [key, data] of Object.entries(this.sortFiles(files))) {
      const path = `${this.filesService.currentRoute}/${key}`.split('/').slice(0, -1).join('/')
      const name = `${this.filesService.currentRoute}/${key}`.split('/').slice(-1)[0]
      const task: FileTask = this.filesTasksService.createUploadTask(path, name, data.size)
      taskReqs.unshift([
        task,
        this.uploadFiles(`${apiRoute}/${key}`, data.form, overwrite).pipe(
          filter((ev: any) => ev.type === HttpEventType.UploadProgress),
          tap((ev: HttpUploadProgressEvent) => this.updateProgress(task, ev))
        )
      ])
    }
    for (const [task, req] of taskReqs) {
      try {
        await lastValueFrom(req)
        task.props.progress = 100
        task.status = FileTaskStatus.SUCCESS
      } catch (e: any) {
        task.status = FileTaskStatus.ERROR
        if (e.status === 0) {
          task.result = e.statusText
        } else {
          task.result = e.error.message
        }
      } finally {
        this.filesTasksService.updateTask(task)
      }
    }
  }

  onDropFiles(ev: any, overwrite: boolean) {
    if (ev.dataTransfer.items && ev.dataTransfer.items[0]?.webkitGetAsEntry) {
      this.webkitReadDataTransfer(ev, overwrite)
    } else {
      this.addFiles(ev.dataTransfer.files, overwrite).catch(console.error)
    }
  }

  uploadOneFile(file: FileModel, content: string, overwrite: boolean) {
    const url = `${API_FILES_OPERATION_UPLOAD}/${file.path}`
    const fileContent = new File([new Blob([content])], file.name.normalize(), { type: file.mime.replace('-', '/') })
    const formData = new FormData()
    formData.append('file', fileContent)
    return this.http.request<void>(overwrite ? 'put' : 'post', url, { body: formData })
  }

  private uploadFiles(url: string, form: FormData, overwrite: boolean) {
    return this.http.request(overwrite ? 'put' : 'post', url, {
      body: form,
      reportProgress: true,
      observe: 'events'
    })
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

  private webkitReadDataTransfer(ev: any, overwrite: boolean) {
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
        this.addFiles(files, overwrite).catch(console.error)
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
