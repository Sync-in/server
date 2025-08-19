/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { Router } from '@angular/router'
import { API_SYNC_CLIENTS, SYNC_ROUTE } from '@sync-in-server/backend/src/applications/sync/constants/routes'
import {
  SYNC_PATH_CONFLICT_MODE,
  SYNC_PATH_DIFF_MODE,
  SYNC_PATH_MODE,
  SYNC_PATH_REPOSITORY
} from '@sync-in-server/backend/src/applications/sync/constants/sync'
import type { SyncClientPaths } from '@sync-in-server/backend/src/applications/sync/interfaces/sync-client-paths.interface'
import { SyncPathFromClient, SyncPathSettings } from '@sync-in-server/backend/src/applications/sync/interfaces/sync-path.interface'
import { capitalizeString } from '@sync-in-server/backend/src/common/shared'
import { map, Observable } from 'rxjs'
import { ELECTRON_DIALOG } from '../../../electron/constants/dialogs'
import { EVENT } from '../../../electron/constants/events'
import { Electron } from '../../../electron/electron.service'
import { LayoutService } from '../../../layout/layout.service'
import { StoreService } from '../../../store/store.service'
import type { FileModel } from '../../files/models/file.model'
import { SPACES_PATH, SPACES_TITLE } from '../../spaces/spaces.constants'
import { CLIENT_SCHEDULER_STATE } from '../constants/client'
import { SYNC_PATH_ACTION } from '../constants/path'
import { SyncClientModel } from '../models/sync-client.model'
import { SyncPathModel } from '../models/sync-path.model'
import { SyncWizardPath } from '../models/sync-wizard-path.model'
import { getServerPath } from '../sync.utils'

@Injectable({
  providedIn: 'root'
})
export class SyncService {
  private readonly router = inject(Router)
  private readonly http = inject(HttpClient)
  private readonly layout = inject(LayoutService)
  private readonly store = inject(StoreService)
  private readonly electron = inject(Electron)
  // wizard
  public wizard: {
    localPath: {
      name: string
      path: string
      mimeUrl: string
      origin: string
    }
    remotePath: SyncWizardPath
    settings: {
      conflictMode: SYNC_PATH_CONFLICT_MODE
      diffMode: SYNC_PATH_DIFF_MODE
      enabled: boolean
      mode: SYNC_PATH_MODE
      name: string
      scheduler: { unit: string; value: number }
    }
  }

  constructor() {
    this.resetWizard()
  }

  showOpenDialog(properties: { properties: ELECTRON_DIALOG[]; defaultPath: string }) {
    return this.electron.invoke(EVENT.MISC.DIALOG_OPEN, properties)
  }

  getFilePath(file: File) {
    return this.electron.ipcRenderer.showFilePath(file)
  }

  getClients(): Observable<SyncClientModel[]> {
    return this.http
      .get<SyncClientPaths[]>(API_SYNC_CLIENTS)
      .pipe(map((clients: SyncClientPaths[]) => clients.map((client: SyncClientPaths) => new SyncClientModel(client))))
  }

  deleteClient(clientId: string): Observable<void> {
    return this.http.delete<void>(`${API_SYNC_CLIENTS}/${clientId}`)
  }

  updateSyncPath(clientId: string, pathId: number, pathSettings: Partial<SyncPathSettings>): Observable<void> {
    return this.http.put<void>(`${API_SYNC_CLIENTS}/${clientId}/${SYNC_ROUTE.PATHS}/${pathId}`, pathSettings)
  }

  deleteSyncPath(clientId: string, pathId: number): Observable<void> {
    return this.http.delete<void>(`${API_SYNC_CLIENTS}/${clientId}/${SYNC_ROUTE.PATHS}/${pathId}`)
  }

  addPath(pathSettings: SyncPathSettings): Promise<SyncPathModel | string> {
    return this.electron.invoke(EVENT.SYNC.PATH_OPERATION, SYNC_PATH_ACTION.ADD, pathSettings)
  }

  updatePath(pathSettings: Partial<SyncPathSettings>): Promise<void> {
    return this.electron.invoke(EVENT.SYNC.PATH_OPERATION, SYNC_PATH_ACTION.SET, pathSettings)
  }

  flushPath(pathId: number): Promise<void> {
    return this.electron.invoke(EVENT.SYNC.PATH_OPERATION, SYNC_PATH_ACTION.FLUSH, pathId)
  }

  removePath(pathId: number): Promise<void> {
    return this.electron.invoke(EVENT.SYNC.PATH_OPERATION, SYNC_PATH_ACTION.REMOVE, pathId)
  }

  doSync(state: boolean, pathIds: number[], reportOnly = false, async = false) {
    this.electron
      .invoke(EVENT.SYNC.PATH_OPERATION, SYNC_PATH_ACTION.SYNC, {
        state: state,
        paths: pathIds,
        reportOnly: reportOnly,
        async: async
      })
      .catch(console.error)
  }

  async refreshPaths(): Promise<void> {
    try {
      const syncPathsFromClient: SyncPathFromClient[] = await this.electron.invoke(EVENT.SYNC.PATH_OPERATION, SYNC_PATH_ACTION.LIST, null)
      this.store.clientSyncPaths.set(syncPathsFromClient.map((s: SyncPathFromClient) => new SyncPathModel(s, true)))
    } catch (e) {
      console.error(e)
    }
  }

  goToPath(path: SyncPathModel, local = true, suffixPath = '') {
    if (local) {
      this.electron.openPath(`${path.settings.localPath}/${suffixPath ? `/${suffixPath}` : ''}`)
    } else {
      const segments = [...path.settings.remotePath.split('/'), ...(suffixPath ? suffixPath.split('/') : [])]
      let name: string
      if (segments.length > 1) {
        name = segments.pop()
      }
      const repository = segments.shift()
      this.router
        .navigate([SPACES_PATH.SPACES, ...SYNC_PATH_REPOSITORY[repository], ...segments], name ? { queryParams: { select: name } } : {})
        .catch(console.error)
    }
  }

  setClientScheduler(state: CLIENT_SCHEDULER_STATE) {
    this.electron.send(EVENT.SYNC.SCHEDULER_STATE, 'update', state)
  }

  getTransfers(pathId: number, query: string) {
    return this.electron.invoke(EVENT.SYNC.TRANSFER_LOGS, 'get', pathId || null, query)
  }

  deleteTransfers(pathId?: number) {
    return this.electron.invoke(EVENT.SYNC.TRANSFER_LOGS, 'delete', pathId || null)
  }

  translateServerPath(path: string): string {
    const segments = getServerPath(path).split('/')
    if (!segments.length) {
      return ''
    }
    segments[0] =
      segments[0] === SPACES_PATH.PERSONAL
        ? this.layout.translateString(SPACES_TITLE.PERSONAL_FILES)
        : this.layout.translateString(capitalizeString(segments[0]))
    return segments.join('/')
  }

  addFileToRemotePath(f: FileModel) {
    this.wizard.remotePath = new SyncWizardPath({
      id: f.id,
      name: f.name,
      path: f.path,
      isDir: f.isDir,
      mime: f.mime,
      mimeUrl: f.mimeUrl,
      enabled: true,
      isWriteable: true,
      inShare: f.path.split('/')[0] === SPACES_PATH.SHARES
    })
  }

  resetWizard() {
    this.wizard = {
      localPath: null,
      remotePath: null,
      settings: {
        enabled: true,
        name: '',
        mode: SYNC_PATH_MODE.BOTH,
        conflictMode: SYNC_PATH_CONFLICT_MODE.RECENT,
        diffMode: SYNC_PATH_DIFF_MODE.FAST,
        scheduler: { unit: 'minute', value: 15 }
      }
    }
  }
}
