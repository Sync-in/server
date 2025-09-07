/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { computed, Injectable, Signal, signal, WritableSignal } from '@angular/core'
import type { SearchFilesDto } from '@sync-in-server/backend/src/applications/files/dto/file-operations.dto'
import type { FileTask } from '@sync-in-server/backend/src/applications/files/models/file-task'
import { AppStoreManifest } from '@sync-in-server/backend/src/applications/sync/interfaces/store-manifest.interface'
import { BehaviorSubject, Subject } from 'rxjs'
import { CommentRecentModel } from '../applications/comments/models/comment-recent.model'
import { FileEvent } from '../applications/files/interfaces/file-event.interface'
import { FileContentModel } from '../applications/files/models/file-content.model'
import { FileRecentModel } from '../applications/files/models/file-recent.model'
import { FileModel } from '../applications/files/models/file.model'
import { ShareLinkModel } from '../applications/links/models/share-link.model'
import { NotificationModel } from '../applications/notifications/models/notification.model'
import { ShareFileModel } from '../applications/shares/models/share-file.model'
import { SpaceModel } from '../applications/spaces/models/space.model'
import { TrashModel } from '../applications/spaces/models/trash.model'
import { CLIENT_SCHEDULER_STATE } from '../applications/sync/constants/client'
import { SyncStatus } from '../applications/sync/interfaces/sync-status.interface'
import { SyncTask } from '../applications/sync/interfaces/sync-task.interface'
import { SyncPathModel } from '../applications/sync/models/sync-path.model'
import { UserType } from '../applications/users/interfaces/user.interface'
import { UserOnlineModel } from '../applications/users/models/user-online.model'
import { myAvatarUrl } from '../applications/users/user.functions'

@Injectable({
  providedIn: 'root'
})
export class StoreService {
  public user = new BehaviorSubject<UserType>(null)
  public userAvatarUrl = new BehaviorSubject<string>(myAvatarUrl())
  public userImpersonate: WritableSignal<boolean> = signal<boolean>(false)
  public isElectronApp: WritableSignal<boolean> = signal<boolean>(false)
  public breadcrumb: BehaviorSubject<string> = new BehaviorSubject<string>('')
  public repository: WritableSignal<string> = signal<string>(null)
  // Files
  public filesClipboard = new BehaviorSubject<FileModel[]>([])
  public filesActiveTasks = new BehaviorSubject<FileTask[]>([])
  public filesEndedTasks = new BehaviorSubject<FileTask[]>([])
  public filesRecents: WritableSignal<FileRecentModel[]> = signal<FileRecentModel[]>([])
  // OnlyOffice
  public filesOnlyOffice: WritableSignal<{ enabled: boolean }> = signal({ enabled: null })
  // Search
  public currentSearch: WritableSignal<SearchFilesDto> = signal<SearchFilesDto>({ content: '', fullText: false })
  public filesSearch: WritableSignal<FileContentModel[]> = signal<FileContentModel[]>([])
  // Comments
  public commentsRecents: WritableSignal<CommentRecentModel[]> = signal<CommentRecentModel[]>([])
  // Websocket
  public onlineUsers: WritableSignal<UserOnlineModel[]> = signal<UserOnlineModel[]>([])
  // Notifications
  public notifications: WritableSignal<NotificationModel[]> = signal<NotificationModel[]>([])
  public unreadNotifications: Signal<NotificationModel[]> = computed(() => this.notifications().filter((n) => !n.wasRead))
  // Selections
  public filesSelection: WritableSignal<FileModel[]> = signal<FileModel[]>([])
  public shareSelection: WritableSignal<ShareFileModel> = signal<ShareFileModel>(null)
  public linkSelection: WritableSignal<ShareLinkModel> = signal<ShareLinkModel>(null)
  public spaceSelection: WritableSignal<SpaceModel> = signal<SpaceModel>(null)
  public trashSelection: WritableSignal<TrashModel> = signal<TrashModel>(null)
  // Events
  public filesOnEvent: Subject<FileEvent> = new Subject<FileEvent>()
  // Client
  public clientScheduler: WritableSignal<CLIENT_SCHEDULER_STATE> = signal<CLIENT_SCHEDULER_STATE>(CLIENT_SCHEDULER_STATE.DISABLED)
  public clientSyncPaths: WritableSignal<SyncPathModel[]> = signal([])
  public clientSyncs = new BehaviorSubject<SyncStatus[]>([])
  public clientSyncsWithErrors = new BehaviorSubject<SyncStatus[]>([])
  public clientSyncIsReporting = new BehaviorSubject<boolean>(false)
  public clientSyncTask = new BehaviorSubject<SyncTask>({ syncPathId: 0, nbTasks: 0 })
  public clientSyncTasksCount = new BehaviorSubject<number>(0)
  // App store
  public appStoreManifest: WritableSignal<AppStoreManifest> = signal(null)

  clean() {
    this.user.next(null)
    this.userImpersonate.set(false)
    this.breadcrumb.next('')
    this.repository.set(null)
    this.filesClipboard.next([])
    this.filesActiveTasks.next([])
    this.filesEndedTasks.next([])
    this.filesRecents.set([])
    this.filesSearch.set([])
    this.commentsRecents.set([])
    // Websocket
    this.onlineUsers.set([])
    // Notifications
    this.notifications.set([])
    // Selections
    this.filesSelection.set([])
    this.shareSelection.set(null)
    this.linkSelection.set(null)
    this.spaceSelection.set(null)
    this.trashSelection.set(null)
    // Client
    this.clientScheduler.set(CLIENT_SCHEDULER_STATE.DISABLED)
    this.clientSyncPaths.set([])
    this.clientSyncs.next([])
    this.clientSyncsWithErrors.next([])
    this.clientSyncIsReporting.next(false)
    this.clientSyncTask.next({ syncPathId: 0, nbTasks: 0 })
    this.clientSyncTasksCount.next(0)
  }
}
