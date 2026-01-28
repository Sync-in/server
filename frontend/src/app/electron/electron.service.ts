/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { effect, inject, Injectable, NgZone } from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { FileTask } from '@sync-in-server/backend/src/applications/files/models/file-task'
import type { SyncClientAuthDto } from '@sync-in-server/backend/src/applications/sync/dtos/sync-client-auth.dto'
import type { SyncClientAuthRegistration } from '@sync-in-server/backend/src/applications/sync/interfaces/sync-client-auth.interface'
import { combineLatest, from, map, Observable } from 'rxjs'
import { NotificationModel } from '../applications/notifications/models/notification.model'
import { CLIENT_APP_COUNTER, CLIENT_SCHEDULER_STATE } from '../applications/sync/constants/client'
import { SyncStatus } from '../applications/sync/interfaces/sync-status.interface'
import { SyncTask } from '../applications/sync/interfaces/sync-task.interface'
import { SYNC_MENU } from '../applications/sync/sync.constants'
import type { AuthResult } from '../auth/auth.interface'
import { StoreService } from '../store/store.service'
import { EVENT } from './constants/events'
import { ElectronIpcRenderer } from './interface'
import { checkIfElectronApp } from './utils'

declare global {
  interface Window {
    ipcRenderer: ElectronIpcRenderer
  }
}

@Injectable({
  providedIn: 'root'
})
export class Electron {
  public readonly enabled = checkIfElectronApp()
  public readonly ipcRenderer = this.enabled ? window.ipcRenderer : null
  private readonly ngZone = inject(NgZone)
  private readonly store = inject(StoreService)
  private syncTasksCount: Record<number, number> = {}

  constructor() {
    this.store.isElectronApp.set(this.enabled)
    if (this.enabled) {
      effect(() => {
        const count = this.store.notifications().filter((n: NotificationModel) => !n.wasRead).length
        this.send(EVENT.APPLICATIONS.COUNTER, CLIENT_APP_COUNTER.NOTIFICATIONS, count)
      })
      this.store.filesActiveTasks.subscribe((tasks: FileTask[]) => this.send(EVENT.APPLICATIONS.COUNTER, CLIENT_APP_COUNTER.TASKS, tasks.length))
      this.ipcRenderer.on(EVENT.SYNC.SCHEDULER_STATE, (_ev, state: CLIENT_SCHEDULER_STATE) => this.store.clientScheduler.set(state))
      this.ipcRenderer.on(EVENT.SYNC.STATUS, (_ev, sync: SyncStatus) => this.ngZone.run(() => this.setSync(sync)))
      this.ipcRenderer.on(EVENT.SYNC.TASKS_COUNT, (_ev, syncTask: SyncTask) => this.ngZone.run(() => this.setSyncTasksCount(syncTask)))
      this.updateSyncMenuIcon()
      this.getSyncsWithErrors()
      this.getClientSchedulerSettings()
    }
  }

  send(channel: string, ...args: any[]): void {
    if (this.enabled) {
      this.ipcRenderer.send(channel, ...args)
    }
  }

  sendMessage(title: string, body: string) {
    this.send(EVENT.APPLICATIONS.MSG, { title: title, body: body })
  }

  invoke(channel: string, ...args: any[]): Promise<any> {
    if (this.enabled) {
      return this.ipcRenderer.invoke(channel, ...args)
    }
    return undefined
  }

  authenticate(): Observable<SyncClientAuthDto> {
    // Get information about client authentication
    return from(this.invoke(EVENT.SERVER.AUTHENTICATION))
  }

  register(login: string, password: string, code?: string): Observable<AuthResult> {
    // The client handles the registration.
    return from(this.invoke(EVENT.SERVER.REGISTRATION, { login, password, code })).pipe(
      map((e: { ok: boolean; msg?: string }) => ({ success: e.ok, message: e.msg ?? null }) satisfies AuthResult)
    )
  }

  externalRegister(externalAuth: SyncClientAuthRegistration): Observable<boolean> {
    // The registration has already been completed on the server, and the client must be updated accordingly.
    return from(this.invoke(EVENT.SERVER.REGISTRATION, null, externalAuth)).pipe(
      map((e: { ok: boolean; msg?: string }) => {
        if (!e.ok) console.error(`${this.externalRegister.name} - ${e.msg}`)
        return e.ok
      })
    )
  }

  openPath(path: string) {
    this.send(EVENT.MISC.FILE_OPEN, path)
  }

  openUrl(url: string) {
    this.send(EVENT.MISC.URL_OPEN, url)
  }

  private setSync(sync: SyncStatus) {
    if (sync.reportOnly) {
      this.store.clientSyncIsReporting.next(sync.state)
      return
    }
    if (sync.state) {
      this.store.clientSyncs.next([...this.store.clientSyncs.getValue(), sync])
    } else {
      this.store.clientSyncs.next(this.store.clientSyncs.getValue().filter((s) => s.syncPathId !== sync.syncPathId))
      this.store.clientSyncTask.next({ syncPathId: sync.syncPathId, nbTasks: 0 })
      if (sync.lastErrors.length || sync.mainError) {
        this.store.clientSyncsWithErrors.next([...this.store.clientSyncsWithErrors.getValue().filter((s) => s.syncPathId !== sync.syncPathId), sync])
      } else {
        this.store.clientSyncsWithErrors.next(this.store.clientSyncsWithErrors.getValue().filter((s) => s.syncPathId !== sync.syncPathId))
      }
    }
    this.send(EVENT.APPLICATIONS.COUNTER, CLIENT_APP_COUNTER.SYNCS, this.store.clientSyncs.getValue().length)
  }

  private setSyncTasksCount(syncTask: SyncTask) {
    if (!this.store.clientSyncs.getValue().find((s) => s.syncPathId === syncTask.syncPathId)) {
      syncTask.nbTasks = 0
    }
    this.store.clientSyncTask.next(syncTask)

    // set tasks count
    if (syncTask.nbTasks === 0) {
      delete this.syncTasksCount[syncTask.syncPathId]
    } else {
      this.syncTasksCount[syncTask.syncPathId] = syncTask.nbTasks
    }
    this.store.clientSyncTasksCount.next(Object.values(this.syncTasksCount).reduce((a, b) => a + b, 0))
  }

  private getClientSchedulerSettings() {
    this.send(EVENT.SYNC.SCHEDULER_STATE)
  }

  private getSyncsWithErrors() {
    this.invoke(EVENT.SYNC.ERRORS)
      .then((syncs: SyncStatus[]) => this.store.clientSyncsWithErrors.next(syncs))
      .catch(console.error)
  }

  private updateSyncMenuIcon() {
    combineLatest([this.store.clientSyncs, this.store.clientSyncsWithErrors, toObservable(this.store.clientScheduler)]).subscribe(
      ([syncs, errors, scheduler]) => {
        if (syncs.length) {
          SYNC_MENU.iconAnimated = true
          SYNC_MENU.count.level = 'purple'
          SYNC_MENU.count.value.next(syncs.length)
        } else if (errors.find((s: SyncStatus) => s.lastErrors.length || !!s.mainError)) {
          SYNC_MENU.count.level = 'danger'
          SYNC_MENU.count.value.next('!')
          SYNC_MENU.iconAnimated = false
        } else if (scheduler === CLIENT_SCHEDULER_STATE.DISABLED) {
          SYNC_MENU.count.level = 'secondary-alt'
          SYNC_MENU.count.value.next('off')
          SYNC_MENU.iconAnimated = false
        } else {
          SYNC_MENU.count.value.next(0)
          SYNC_MENU.iconAnimated = false
        }
      }
    )
  }
}
