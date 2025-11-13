/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import type { TreeNode } from '@ali-hm/angular-tree-component'
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { DomSanitizer } from '@angular/platform-browser'
import { FILE_MODE, FILE_OPERATION } from '@sync-in-server/backend/src/applications/files/constants/operations'
import {
  API_FILES_ONLY_OFFICE_STATUS,
  API_FILES_OPERATION_MAKE,
  API_FILES_RECENTS,
  API_FILES_SEARCH,
  API_FILES_TASK_OPERATION_COMPRESS,
  API_FILES_TASK_OPERATION_DECOMPRESS,
  API_FILES_TASK_OPERATION_DOWNLOAD,
  API_FILES_TASKS_DOWNLOAD
} from '@sync-in-server/backend/src/applications/files/constants/routes'
import type {
  CompressFileDto,
  CopyMoveFileDto,
  DownloadFileDto,
  MakeFileDto,
  SearchFilesDto
} from '@sync-in-server/backend/src/applications/files/dto/file-operations.dto'
import type { FileLockProps } from '@sync-in-server/backend/src/applications/files/interfaces/file-props.interface'
import type { FileTree } from '@sync-in-server/backend/src/applications/files/interfaces/file-tree.interface'
import type { FileTask } from '@sync-in-server/backend/src/applications/files/models/file-task'
import type { FileContent } from '@sync-in-server/backend/src/applications/files/schemas/file-content.interface'
import type { FileRecent } from '@sync-in-server/backend/src/applications/files/schemas/file-recent.interface'
import { API_SPACES_TREE } from '@sync-in-server/backend/src/applications/spaces/constants/routes'
import { SPACE_OPERATION } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import { forbiddenChars, isValidFileName } from '@sync-in-server/backend/src/common/shared'
import { BsModalRef } from 'ngx-bootstrap/modal'
import { EMPTY, firstValueFrom, map, Observable, Subject } from 'rxjs'
import { downloadWithAnchor } from '../../../common/utils/functions'
import { TAB_MENU } from '../../../layout/layout.interfaces'
import { LayoutService } from '../../../layout/layout.service'
import { StoreService } from '../../../store/store.service'
import { FilesOverwriteDialogComponent } from '../components/dialogs/files-overwrite-dialog.component'
import { FilesViewerDialogComponent } from '../components/dialogs/files-viewer-dialog.component'
import { SHORT_MIME } from '../files.constants'
import { FileContentModel } from '../models/file-content.model'
import { FileRecentModel } from '../models/file-recent.model'
import { FileModel } from '../models/file.model'
import { FilesTasksService } from './files-tasks.service'

@Injectable({ providedIn: 'root' })
export class FilesService {
  // Tree section
  public treeNodeSelected: TreeNode = null
  public treeCopyMoveOn = new Subject<void>()
  // Clipboard section
  public clipboardAction: 'copyPaste' | 'cutPaste' = 'copyPaste'
  // Files
  public currentRoute: string
  private readonly http = inject(HttpClient)
  private readonly layout = inject(LayoutService)
  private readonly store = inject(StoreService)
  private readonly sanitizer = inject(DomSanitizer)
  private readonly filesTasksService = inject(FilesTasksService)

  getTreeNode(nodePath: string, showFiles = false): Promise<FileTree[]> {
    return firstValueFrom(
      this.http.get<FileTree[]>(`${API_SPACES_TREE}/${nodePath}`, { params: showFiles ? new HttpParams().set('showFiles', showFiles) : null })
    )
  }

  addToClipboard(files: FileModel[]) {
    if (!files.length) return
    if (!this.store.filesClipboard.getValue().length) {
      this.layout.showRSideBarTab(TAB_MENU.CLIPBOARD, true)
      this.store.filesClipboard.next(files)
    } else {
      const uniq = files.filter((f: FileModel) => this.store.filesClipboard.getValue().indexOf(f) === -1)
      if (uniq.length) {
        this.store.filesClipboard.next([...uniq, ...this.store.filesClipboard.getValue()])
      }
    }
  }

  removeFromClipboard(file: FileModel) {
    this.store.filesClipboard.next(this.store.filesClipboard.getValue().filter((f: FileModel) => f.id !== file.id))
  }

  clearClipboard() {
    this.store.filesClipboard.next([])
  }

  onPasteClipboard(action?: 'copyPaste' | 'cutPaste') {
    const operation = action ? action : this.clipboardAction
    if (this.store.filesClipboard.getValue().length) {
      const dirPath: string = this.currentRoute
      this.copyMove([...this.store.filesClipboard.getValue()], dirPath, operation === 'copyPaste' ? FILE_OPERATION.COPY : FILE_OPERATION.MOVE)
      this.clearClipboard()
    }
  }

  download(file: FileModel) {
    downloadWithAnchor(file.dataUrl)
  }

  async copyMove(files: FileModel[], dstDirectory: string, type: FILE_OPERATION.COPY | FILE_OPERATION.MOVE): Promise<void> {
    let overwrite = false
    const dstFiles = await this.getTreeNode(dstDirectory, true)
    const exist: FileModel[] = files.filter((f: FileModel) => dstFiles.some((x) => x.name.toLowerCase() === f.name.toLowerCase()))
    if (exist.length > 0) {
      overwrite = await this.openOverwriteDialog(exist)
      if (!overwrite) return
    }
    const isMove = type === FILE_OPERATION.MOVE
    for (const file of files) {
      if (isMove) file.isBeingDeleted = true
      const op: CopyMoveFileDto = { dstDirectory: dstDirectory, overwrite: overwrite }
      this.http.request<FileTask>(type, file.taskUrl, { body: op }).subscribe({
        next: (t: FileTask) => this.filesTasksService.addTask(t),
        error: (e: HttpErrorResponse) => {
          if (isMove) file.isBeingDeleted = false
          this.layout.sendNotification('error', type === 'move' ? 'Move failed' : 'Copy failed', file.name, e)
        }
      })
    }
  }

  rename(file: FileModel, name: string, overwrite = false): Observable<Pick<FileTask, 'name'>> {
    if (!this.isValidName(name)) return EMPTY
    const dstDirectory = file.path.split('/').slice(0, -1).join('/') || '.'
    const op: CopyMoveFileDto = { dstDirectory: dstDirectory, dstName: name, overwrite: overwrite }
    return this.http.request<Pick<FileTask, 'name'>>(FILE_OPERATION.MOVE, file.dataUrl, { body: op })
  }

  delete(files: FileModel[]) {
    for (const file of files) {
      file.isBeingDeleted = true
      this.http.delete<FileTask>(file.taskUrl).subscribe({
        next: (t: FileTask) => this.filesTasksService.addTask(t),
        error: (e: HttpErrorResponse) => {
          file.isBeingDeleted = false
          this.layout.sendNotification('error', 'Deletion failed', file.name, e)
        }
      })
    }
  }

  make(type: 'file' | 'directory', name: string, dirPath: string, asCallBack: true): Observable<any>
  make(type: 'file' | 'directory', name: string, dirPath?: string, asCallBack?: false): void
  make(type: 'file' | 'directory', name: string, dirPath: string = null, asCallBack = false): Observable<any> | void {
    if (!this.isValidName(name)) return
    dirPath = dirPath || this.currentRoute
    const op: MakeFileDto = { type: type }
    if (asCallBack) {
      return this.http.post(`${API_FILES_OPERATION_MAKE}/${dirPath}/${name}`, op)
    } else {
      this.http.post(`${API_FILES_OPERATION_MAKE}/${dirPath}/${name}`, op).subscribe({
        next: () => this.store.filesOnEvent.next({ filePath: dirPath, fileName: name, focus: true, reload: true }),
        error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Creation failed', name, e)
      })
    }
  }

  compress(op: CompressFileDto) {
    const dirPath = this.currentRoute
    this.http.post<FileTask>(`${API_FILES_TASK_OPERATION_COMPRESS}/${dirPath}/${op.name}.${op.extension}`, op).subscribe({
      next: (t: FileTask) => this.filesTasksService.addTask(t),
      error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Compression failed', op.name, e)
    })
  }

  decompress(file: FileModel) {
    const dirPath = this.currentRoute
    this.http.post<FileTask>(`${API_FILES_TASK_OPERATION_DECOMPRESS}/${dirPath}/${file.name}`, null).subscribe({
      next: (t: FileTask) => this.filesTasksService.addTask(t),
      error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Compression failed', file.name, e)
    })
  }

  downloadFromUrl(url: string, name: string) {
    if (!this.isValidName(name)) return
    const dirPath = this.currentRoute
    const op: DownloadFileDto = { url: url }
    this.http.post<FileTask>(`${API_FILES_TASK_OPERATION_DOWNLOAD}/${dirPath}/${name}`, op).subscribe({
      next: (t: FileTask) => this.filesTasksService.addTask(t),
      error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Download failed', url, e)
    })
  }

  downloadTaskArchive(taskId: string) {
    downloadWithAnchor(`${API_FILES_TASKS_DOWNLOAD}/${taskId}`)
  }

  loadRecents(limit: number) {
    this.http
      .get<FileRecent[]>(API_FILES_RECENTS, { params: new HttpParams().set('limit', limit) })
      .pipe(map((fs) => fs.map((f) => new FileRecentModel(f))))
      .subscribe({
        next: (fs: FileRecentModel[]) => {
          this.store.filesRecents.update((files) => [...fs, ...files.slice(limit)])
        },
        error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Files', 'Unable to load', e)
      })
  }

  search(search: SearchFilesDto): Observable<FileContentModel[]> {
    return this.http.request<FileContent[]>('search', API_FILES_SEARCH, { body: search }).pipe(
      map((fs) =>
        fs.map((f) => {
          if (f.content) {
            f.content = this.sanitizer.bypassSecurityTrustHtml(f.content) as string
          }
          return new FileContentModel(f)
        })
      )
    )
  }

  lock(file: FileModel): Observable<FileLockProps> {
    return this.http.request<FileLockProps>('lock', file.dataUrl)
  }

  unlock(file: FileModel): Observable<void> {
    return this.http.request<void>('unlock', file.dataUrl)
  }

  async openOverwriteDialog(files: File[] | FileModel[], renamedTo?: string): Promise<boolean> {
    const overwriteDialog: BsModalRef<FilesOverwriteDialogComponent> = this.layout.openDialog(FilesOverwriteDialogComponent, null, {
      initialState: {
        files: files,
        renamedTo: renamedTo
      } as FilesOverwriteDialogComponent
    })
    return new Promise<boolean>((resolve) => {
      overwriteDialog.content.overwrite.subscribe(resolve)
    })
  }

  async openViewerDialog(mode: FILE_MODE, file: FileModel, directoryFiles: FileModel[], permissions: string) {
    this.http.head(file.dataUrl).subscribe({
      next: async () => {
        let hookedShortMime: string
        try {
          hookedShortMime = await this.viewerHook(mode, file)
        } catch {
          // OnlyOffice isn't enabled, falling back to download
          this.download(file)
          return
        }
        const isWriteable = permissions.indexOf(SPACE_OPERATION.MODIFY) > -1
        if (mode === FILE_MODE.EDIT && !isWriteable) {
          mode = FILE_MODE.VIEW
        }
        this.layout.openDialog(FilesViewerDialogComponent, 'full', {
          id: file.id, // only used to manage the modal
          initialState: {
            currentFile: file,
            directoryFiles: directoryFiles,
            mode: mode,
            isWriteable: isWriteable,
            hookedShortMime: hookedShortMime
          } satisfies Partial<FilesViewerDialogComponent>
        })
      },
      error: (e: HttpErrorResponse) => {
        this.layout.sendNotification('error', 'Unable to open document', file?.name, e)
      }
    })
  }

  private async viewerHook(mode: FILE_MODE, file: FileModel): Promise<string> {
    const onlyOfficeEnabled = await this.getOnlyOfficeStatus()
    if (file.shortMime === SHORT_MIME.DOCUMENT && !onlyOfficeEnabled) {
      if (file.mime.startsWith('text-')) {
        return SHORT_MIME.TEXT
      }
      throw new Error('Feature not enabled')
    }
    if (file.shortMime === SHORT_MIME.PDF) {
      if (mode === FILE_MODE.EDIT && onlyOfficeEnabled) {
        return SHORT_MIME.DOCUMENT
      }
    }
    return file.shortMime
  }

  private async getOnlyOfficeStatus(): Promise<boolean> {
    if (this.store.filesOnlyOffice().enabled !== null) {
      return this.store.filesOnlyOffice().enabled
    }
    try {
      const status = await firstValueFrom(this.http.get<{ enabled: boolean }>(API_FILES_ONLY_OFFICE_STATUS))
      this.store.filesOnlyOffice.set(status)
      return status.enabled
    } catch {
      const fallback = { enabled: false }
      this.store.filesOnlyOffice.set(fallback)
      return fallback.enabled
    }
  }

  private isValidName(fileName: string): boolean {
    try {
      isValidFileName(fileName)
      return true
    } catch (e: any) {
      this.layout.sendNotification('error', 'Rename', `${this.layout.translateString(e.message)} : ${forbiddenChars}`)
      return false
    }
  }
}
